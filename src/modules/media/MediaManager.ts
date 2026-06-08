import { EventEmitter } from "@/modules/shared/EventEmitter";
import micWorkletUrl from "../worklets/AudioWorkletMic.ts?worklet";
import outWorkletUrl from "../worklets/AudioWorkletOut.ts?worklet";

/**
 * Microphone permission state as reported by the browser. "unknown" is used
 * before the first probe completes (or on browsers that don't ship
 * `navigator.permissions.query({ name: 'microphone' })`).
 */
export type MicrophonePermissionState = PermissionState | "unknown";

export type MediaManagerEvents = {
    devicesChanged: [devices: MediaDeviceInfo[]];
    permissionChanged: [state: MicrophonePermissionState];
    micChanged: [device: MediaDeviceInfo | null, track: MediaStreamTrack | null];
    speakerChanged: [device: MediaDeviceInfo | null];
    muteChanged: [muted: boolean];
};

export interface MediaManagerState {
    devices: MediaDeviceInfo[];
    activeMic?: MediaDeviceInfo;
    activeSpeaker?: MediaDeviceInfo;
    stream?: MediaStream;
    muted: boolean;
}

export class MediaManager extends EventEmitter<MediaManagerEvents> {
    public devices: MediaDeviceInfo[] = [];
    public activeMic?: MediaDeviceInfo;
    public activeSpeaker?: MediaDeviceInfo;
    public stream?: MediaStream;
    public muted = false;
    public readonly audioContext: AudioContext;

    private attachedElements: Set<HTMLAudioElement> = new Set();
    private activeSpeakerId?: string;
    private permissionGranted = false;
    private permissionState: MicrophonePermissionState = "unknown";
    private permissionStatus?: PermissionStatus;
    private unblockAttempted = false;
    private readonly _workletReady: Promise<void>;

    constructor() {
        super();
        this.audioContext = new AudioContext({ latencyHint: 0 });

        this._workletReady = Promise.all([
            this.audioContext.audioWorklet.addModule(LIB_SAMPLE_RATE_URL),
            this.audioContext.audioWorklet.addModule(micWorkletUrl),
            this.audioContext.audioWorklet.addModule(outWorkletUrl),
        ]).then(() => this.audioContext.suspend());

        this.probePermission();
        this.enumerateDevices();
        navigator.mediaDevices.addEventListener("devicechange", this.handleDeviceChange);
    }

    /**
     * Last-known microphone permission state. Reflects the browser report (or
     * "unknown" before the initial probe resolves). Consumers should subscribe
     * to `permissionChanged` instead of polling.
     */
    getPermissionState(): MicrophonePermissionState {
        return this.permissionState;
    }

    /**
     * Re-run `enumerateDevices()` and resolve with the latest snapshot. When
     * permission is "granted" but the browser is still hiding device IDs
     * (Chromium hides them until the tab has acquired a stream at least once),
     * acquires a throwaway stream to unblock the IDs and re-enumerates. One-shot
     * guard prevents a loop on truly blank contexts (e.g. http:// pages).
     */
    async refreshDevices(): Promise<MediaDeviceInfo[]> {
        await this.enumerateDevices();
        if (this.shouldUnblock()) await this.unblockDeviceIds();
        return this.devices;
    }

    /**
     * Force a `getUserMedia({ audio: true })` flow to surface the browser's
     * permission prompt and resolve the resulting permission state. Stops the
     * acquired tracks immediately — this call is purely to obtain (or confirm)
     * permission, not to start streaming.
     */
    async requestMicrophonePermission(): Promise<MicrophonePermissionState> {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            for (const track of stream.getTracks()) track.stop();
            this.unblockAttempted = true;
            this.setPermissionState("granted");
            await this.enumerateDevices();
        } catch {
            this.setPermissionState("denied");
        }
        return this.permissionState;
    }

    waitReady(): Promise<void> {
        return this._workletReady;
    }

    /**
     * Returns true if at least one microphone and one speaker are available.
     */
    haveMedia(): boolean {
        const hasMic = this.devices.some((d) => d.kind === "audioinput");
        const hasSpeaker = this.devices.some((d) => d.kind === "audiooutput");
        return hasMic && hasSpeaker;
    }

    /**
     * Resume the AudioContext, acquire the microphone stream and return it.
     * Uses the activeMic if already chosen, otherwise the first available microphone.
     * Safe to call multiple times — returns the existing stream if already started.
     */
    async startMedia(): Promise<MediaStream> {
        if (this.stream) return this.stream;

        await this._workletReady;

        const mic = this.activeMic ?? this.devices.find((d) => d.kind === "audioinput");

        const constraints: MediaStreamConstraints = {
            audio: {
                ...(this.permissionGranted && mic && { deviceId: { exact: mic.deviceId } }),
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
            video: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.stream = stream;
        this.permissionGranted = true;

        await this.enumerateDevices();

        const trackSettings = stream.getAudioTracks()[0]?.getSettings();
        if (trackSettings?.deviceId) {
            this.activeMic =
                this.devices.find((d) => d.kind === "audioinput" && d.deviceId === trackSettings.deviceId) ??
                this.activeMic;
        }

        if (this.audioContext.state === "suspended") {
            await this.audioContext.resume();
        }

        return stream;
    }

    /**
     * Suspend the AudioContext and stop microphone capture.
     * Does not destroy the AudioContext — it can be restarted via startMedia().
     */
    async stopMedia(): Promise<void> {
        if (this.stream) {
            for (const track of this.stream.getTracks()) {
                track.stop();
            }
            this.stream = undefined;
        }

        if (this.audioContext.state === "running") {
            await this.audioContext.suspend();
        }
    }

    /**
     * Tear down everything: stop media, remove listeners, close AudioContext.
     */
    async destroy(): Promise<void> {
        await this.stopMedia();

        navigator.mediaDevices.removeEventListener("devicechange", this.handleDeviceChange);

        await this.audioContext.close();
        this.removeAllListeners();
    }

    /**
     * Switch the active microphone.
     * If a stream is already running, performs a seamless hot-swap:
     * acquires the new device, replaces the track in-place on the existing
     * stream, and stops the old track — no interruption to active senders.
     */
    async setMicrophone(deviceId: string): Promise<boolean> {
        const device = this.devices.find((d) => d.kind === "audioinput" && d.deviceId === deviceId);

        if (!device) {
            return false;
        }

        if (!this.stream) {
            this.activeMic = device;
            this.emit("micChanged", device, null);
            return true;
        }

        const newStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: { exact: deviceId },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
            video: false,
        });

        const newTrack = newStream.getAudioTracks()[0];

        newTrack.enabled = !this.muted;

        const oldTrack = this.stream.getAudioTracks()[0];
        if (oldTrack) {
            this.stream.removeTrack(oldTrack);
            oldTrack.stop();
        }
        this.stream.addTrack(newTrack);

        this.activeMic = device;
        this.emit("micChanged", device, newTrack);
        return true;
    }

    /**
     * Switch the active speaker.
     * Applies setSinkId to all currently attached HTMLAudioElements and
     * stores the preference for future attachments.
     *
     * Note: setSinkId is not available in all browsers (Firefox lacks it as
     * of 2024). The method degrades gracefully when unsupported.
     */
    async setSpeaker(deviceId: string): Promise<void> {
        const device = this.devices.find((d) => d.kind === "audiooutput" && d.deviceId === deviceId);

        if (!device) {
            throw new Error(`Speaker device not found: ${deviceId}`);
        }

        this.activeSpeakerId = deviceId;
        this.activeSpeaker = device;

        await Promise.all([...this.attachedElements].map((el) => this.applySinkId(el, deviceId)));

        this.emit("speakerChanged", device);
    }

    /**
     * Register an HTMLAudioElement for speaker routing (WebRTC path).
     * Immediately applies the current speaker preference and keeps it
     * in sync with future setSpeaker() calls.
     */
    async attachSpeaker(el: HTMLAudioElement): Promise<void> {
        this.attachedElements.add(el);

        if (this.activeSpeakerId) {
            await this.applySinkId(el, this.activeSpeakerId);
        }
    }

    /**
     * Detach an HTMLAudioElement from speaker routing.
     */
    detachSpeaker(el: HTMLAudioElement): void {
        this.attachedElements.delete(el);
    }

    /**
     * Returns the AudioContext destination node for the WebSocket transport
     * to connect its output worklet into.
     *
     * WebSocket path:
     *   WebSocket message → AudioDataWorkletStream → getOutputDestination()
     *
     * The AudioContext's native sample rate is available via audioContext.sampleRate,
     * and should be passed to ResampleProcessor as the inputSampleRate.
     */
    getOutputDestination(): AudioDestinationNode {
        return this.audioContext.destination;
    }

    /**
     * Toggle microphone mute state.
     * Operates on track.enabled — no stream teardown, no re-negotiation.
     */
    toggleMute(): void {
        if (!this.stream) return;

        this.muted = !this.muted;

        for (const track of this.stream.getAudioTracks()) {
            track.enabled = !this.muted;
        }

        this.emit("muteChanged", this.muted);
    }

    /**
     * Explicitly set mute state.
     */
    setMuted(muted: boolean): void {
        if (!this.stream || this.muted === muted) return;

        this.muted = muted;

        for (const track of this.stream.getAudioTracks()) {
            track.enabled = !this.muted;
        }

        this.emit("muteChanged", this.muted);
    }

    getState(): MediaManagerState {
        return {
            devices: this.devices,
            activeMic: this.activeMic,
            activeSpeaker: this.activeSpeaker,
            stream: this.stream,
            muted: this.muted,
        };
    }

    /**
     * Query `navigator.permissions.query({ name: 'microphone' })` once and
     * subscribe to `change` so the cached state stays current. Browsers without
     * the 'microphone' permission name (Firefox, Safari) keep state as
     * "unknown" until the next `requestMicrophonePermission` call resolves.
     */
    private async probePermission(): Promise<void> {
        if (!navigator.permissions?.query) return;
        try {
            const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
            this.permissionStatus = status;
            this.setPermissionState(status.state);
            if (status.state === "granted") await this.refreshDevices();
            status.addEventListener("change", async () => {
                this.setPermissionState(status.state);
                if (status.state === "granted") await this.refreshDevices();
            });
        } catch {
            // 'microphone' permission name not supported — leave state as "unknown".
        }
    }

    /**
     * Returns true when the cached device list is unusable — every entry has a
     * blank `deviceId` — yet permission is reported as "granted". Chromium
     * exhibits this on a fresh tab that inherited persisted permission but has
     * not acquired a stream yet: enumerate returns placeholder rows. Guarded by
     * `unblockAttempted` so we don't loop on a permanently-blank context
     * (http://, restricted iframe).
     */
    private shouldUnblock(): boolean {
        if (this.unblockAttempted) return false;
        if (this.permissionState !== "granted") return false;
        if (!this.devices.length) return true;
        return this.devices.every((d) => !d.deviceId);
    }

    /**
     * Acquire a throwaway audio stream then stop it. Forces Chromium to expose
     * real `deviceId`/`label` on the next `enumerateDevices()` call.
     */
    private async unblockDeviceIds(): Promise<void> {
        this.unblockAttempted = true;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            for (const track of stream.getTracks()) track.stop();
            await this.enumerateDevices();
        } catch (err) {
            console.warn("[MediaManager] unblockDeviceIds failed:", err);
        }
    }

    private setPermissionState(state: MicrophonePermissionState): void {
        if (this.permissionState === state) return;
        this.permissionState = state;
        if (state === "granted") this.permissionGranted = true;
        this.emit("permissionChanged", state);
    }

    private async enumerateDevices(): Promise<void> {
        const all = await navigator.mediaDevices.enumerateDevices();
        this.devices = all.filter((d) => d.kind === "audioinput" || d.kind === "audiooutput");

        if (this.permissionGranted) {
            if (!this.activeMic) {
                this.activeMic = this.devices.find((d) => d.kind === "audioinput");
            }
            if (!this.activeSpeaker) {
                this.activeSpeaker = this.devices.find((d) => d.kind === "audiooutput");
                if (this.activeSpeaker) {
                    this.activeSpeakerId = this.activeSpeaker.deviceId;
                }
            }
        }

        this.emit("devicesChanged", this.devices);
    }

    private handleDeviceChange = async (): Promise<void> => {
        const prevMicId = this.activeMic?.deviceId;
        const prevSpeakerId = this.activeSpeaker?.deviceId;

        await this.enumerateDevices();

        if (prevMicId) {
            const still = this.devices.find((d) => d.kind === "audioinput" && d.deviceId === prevMicId);
            if (!still) {
                this.activeMic = undefined;
                this.emit("micChanged", null, null);
            }
        }

        if (prevSpeakerId) {
            const still = this.devices.find((d) => d.kind === "audiooutput" && d.deviceId === prevSpeakerId);
            if (!still) {
                this.activeSpeaker = undefined;
                this.activeSpeakerId = undefined;
                this.emit("speakerChanged", null);
            }
        }
    };

    private async applySinkId(el: HTMLAudioElement, deviceId: string): Promise<void> {
        if (typeof (el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId === "function") {
            try {
                await (el as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId);
            } catch (err) {
                console.warn("[MediaManager] setSinkId failed:", err);
            }
        }
    }
}

export const LIB_SAMPLE_RATE_URL =
    "https://cdn.jsdelivr.net/npm/@alexanderolsen/libsamplerate-js@2.1.2/dist/libsamplerate.worklet.js";
