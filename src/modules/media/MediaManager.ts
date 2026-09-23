import { EventEmitter } from "@/modules/shared/EventEmitter";
// Embutido no bundle pelo vite-plugin-worklet, e não puxado de CDN: a lib não depende de
// rede nem de CDN no carregamento da página do integrador.
import libSampleRateWorkletSource from "@alexanderolsen/libsamplerate-js/dist/libsamplerate.worklet.js?worklet";
import micWorkletSource from "../worklets/AudioWorkletMic.ts?worklet";
import outWorkletSource from "../worklets/AudioWorkletOut.ts?worklet";

export type MediaManagerEvents = {
    devicesChanged: [devices: MediaDeviceInfo[]];
    micChanged: [device: MediaDeviceInfo | null];
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
    // Preguiçoso para um MediaManager construído e nunca usado não pagar o custo de
    // addModule dos três worklets.
    private _workletReady: Promise<void> | null = null;

    constructor() {
        super();
        this.audioContext = new AudioContext({ latencyHint: 0 });

        this.enumerateDevices();
        navigator.mediaDevices.addEventListener("devicechange", this.handleDeviceChange);
    }

    waitReady(): Promise<void> {
        return this.loadWorklets();
    }

    /**
     * A Blob URL nasce aqui, e não no import do módulo: criá-la no import faz `import
     * "@wavoip/wavoip-api"` já depender de `URL.createObjectURL`, que o React Native não
     * tem — e contradiz o `sideEffects: false` do pacote.
     */
    private loadWorklets(): Promise<void> {
        if (this._workletReady) return this._workletReady;
        const sources = [libSampleRateWorkletSource, micWorkletSource, outWorkletSource];
        this._workletReady = Promise.all(sources.map((source) => this.addWorklet(source))).then(() =>
            this.audioContext.suspend(),
        );
        return this._workletReady;
    }

    private async addWorklet(source: string): Promise<void> {
        const url = URL.createObjectURL(new Blob([source], { type: "application/javascript" }));
        try {
            await this.audioContext.audioWorklet.addModule(url);
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    haveMedia(): boolean {
        const hasMic = this.devices.some((d) => d.kind === "audioinput");
        const hasSpeaker = this.devices.some((d) => d.kind === "audiooutput");
        return hasMic && hasSpeaker;
    }

    async startMedia(): Promise<MediaStream> {
        if (this.stream) return this.stream;

        await this.loadWorklets();

        const mic = this.activeMic ?? this.devices.find((d) => d.kind === "audioinput");
        const pinned = this.permissionGranted ? mic?.deviceId : undefined;

        const stream = await navigator.mediaDevices.getUserMedia(buildAudioConstraints(pinned));
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

    async destroy(): Promise<void> {
        await this.stopMedia();

        navigator.mediaDevices.removeEventListener("devicechange", this.handleDeviceChange);

        await this.audioContext.close();
        this.removeAllListeners();
    }

    /**
     * Com stream rodando, troca a track dentro do próprio stream em vez de criar outro,
     * para quem já está enviando não ser interrompido.
     */
    async setMicrophone(deviceId: string): Promise<boolean> {
        const device = this.devices.find((d) => d.kind === "audioinput" && d.deviceId === deviceId);

        if (!device) {
            return false;
        }

        if (!this.stream) {
            this.activeMic = device;
            this.emit("micChanged", device);
            return true;
        }

        const newStream = await navigator.mediaDevices.getUserMedia(buildAudioConstraints(deviceId));

        const newTrack = newStream.getAudioTracks()[0];

        newTrack.enabled = !this.muted;

        const oldTrack = this.stream.getAudioTracks()[0];
        if (oldTrack) {
            this.stream.removeTrack(oldTrack);
            oldTrack.stop();
        }
        this.stream.addTrack(newTrack);

        this.activeMic = device;
        this.emit("micChanged", device);
        return true;
    }

    /**
     * setSinkId não existe em todo navegador (o Firefox não tinha em 2024); sem ele, a
     * troca de alto-falante simplesmente não acontece.
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

    async attachSpeaker(el: HTMLAudioElement): Promise<void> {
        this.attachedElements.add(el);

        if (this.activeSpeakerId) {
            await this.applySinkId(el, this.activeSpeakerId);
        }
    }

    detachSpeaker(el: HTMLAudioElement): void {
        this.attachedElements.delete(el);
    }

    /**
     * Pelo track.enabled: sem derrubar o stream e sem renegociar.
     */
    toggleMute(): void {
        if (!this.stream) return;

        this.muted = !this.muted;

        for (const track of this.stream.getAudioTracks()) {
            track.enabled = !this.muted;
        }

        this.emit("muteChanged", this.muted);
    }

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
    }

    private handleDeviceChange = async (): Promise<void> => {
        const prevMicId = this.activeMic?.deviceId;
        const prevSpeakerId = this.activeSpeaker?.deviceId;

        await this.enumerateDevices();
        this.emit("devicesChanged", this.devices);

        if (prevMicId) {
            const still = this.devices.find((d) => d.kind === "audioinput" && d.deviceId === prevMicId);
            if (!still) {
                this.activeMic = undefined;
                this.emit("micChanged", null);
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

function buildAudioConstraints(deviceId?: string): MediaStreamConstraints {
    return {
        audio: {
            ...(deviceId && { deviceId: { exact: deviceId } }),
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
        },
        video: false,
    };
}
