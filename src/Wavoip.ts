import type { CallOutgoing } from "@/modules/call/CallOutgoing";
import type { Offer } from "@/modules/call/Offer";
import { type Device, DeviceConnection } from "@/modules/device/DeviceConnection";
import { DeviceProxy } from "@/modules/device/DeviceProxy";
import { MediaManager, type MicrophonePermissionState } from "@/modules/media/MediaManager";
import { EventEmitter, type Unsubscribe } from "@/modules/shared/EventEmitter";
import { type Language, setLanguage } from "@/modules/shared/i18n";

type Events = {
    offer: [offer: Offer];
};

export class Wavoip extends EventEmitter<Events> {
    private readonly mediaManager: MediaManager;
    private _devices: DeviceConnection[] = [];
    private _onOfferUnsub?: () => void;

    constructor(params: {
        tokens: string[];
        platform?: string;
        language?: Language;
    }) {
        super();

        setLanguage(params.language ?? "pt-BR");

        this.mediaManager = new MediaManager();

        for (const token of [...new Set(params.tokens)]) {
            const device = new DeviceConnection(this.mediaManager, token, params.platform);
            this.bindDeviceEvents(device);
            this._devices.push(device);
        }
    }

    /** @deprecated Use `on("offer", callback)` instead. */
    onOffer(cb: (offer: Offer) => void) {
        this._onOfferUnsub?.();
        this._onOfferUnsub = this.on("offer", cb);
    }

    /**
     * Switch the locale used by `canCall()` error messages and any other
     * library-emitted strings. Affects every Wavoip instance — locale state is
     * module-global within the `wavoip-api` a18n namespace.
     *
     * @example
     * wavoip.setLanguage("es")
     */
    setLanguage(lang: Language): void {
        setLanguage(lang);
    }

    get multimedia() {
        return {
            microphone: this.mediaManager.activeMic,
            speaker: this.mediaManager.activeSpeaker,
        };
    }

    getMultimediaDevices(): MediaDeviceInfo[] {
        return this.mediaManager.devices;
    }

    /**
     * Force a fresh `enumerateDevices()` pass. When permission is granted but
     * the browser is hiding device IDs (Chromium does this on a fresh tab with
     * persisted permission), automatically acquires a throwaway stream to
     * unblock the IDs. Resolves with the latest snapshot.
     */
    refreshMultimediaDevices(): Promise<MediaDeviceInfo[]> {
        return this.mediaManager.refreshDevices();
    }

    /**
     * Subscribe to the live multimedia device list. Fires whenever the OS
     * reports a `devicechange` or the microphone permission flips to granted.
     */
    onDevicesChanged(cb: (devices: MediaDeviceInfo[]) => void): Unsubscribe {
        return this.mediaManager.on("devicesChanged", cb);
    }

    /**
     * Last-known microphone permission state. Use `onMicrophonePermissionChanged`
     * to react to transitions instead of polling.
     */
    getMicrophonePermission(): MicrophonePermissionState {
        return this.mediaManager.getPermissionState();
    }

    /**
     * Subscribe to microphone permission state transitions reported by the
     * browser (granted, denied, prompt, or "unknown" while the initial probe
     * is in flight).
     */
    onMicrophonePermissionChanged(cb: (state: MicrophonePermissionState) => void): Unsubscribe {
        return this.mediaManager.on("permissionChanged", cb);
    }

    /**
     * Trigger the browser's microphone permission prompt and resolve with the
     * resulting state. Acquires a stream just long enough to surface the
     * prompt, then stops the tracks immediately.
     */
    requestMicrophonePermission(): Promise<MicrophonePermissionState> {
        return this.mediaManager.requestMicrophonePermission();
    }

    /**
     * Pick the microphone that any current or future call should use.
     * If a call is active, performs a seamless hot-swap via the underlying
     * transport's replaceTrack (WebRTC) or AudioInput rebuild (WebSocket).
     * Otherwise stores the preference for the next call.
     */
    async setMicrophone(deviceId: string): Promise<{ err: string | null }> {
        try {
            const ok = await this.mediaManager.setMicrophone(deviceId);
            if (!ok) return { err: `Microphone device not found: ${deviceId}` };
            return { err: null };
        } catch (e) {
            return { err: e instanceof Error ? e.message : "setMicrophone failed" };
        }
    }

    /**
     * Attempts to start an outgoing call using one or more available devices.
     *
     * Tries each device in sequence until one successfully initiates a call.
     * If all devices fail, returns a detailed error report listing reasons per device.
     */
    async startCall(params: {
        fromTokens?: string[];
        to: string;
    }): Promise<
        | { call: CallOutgoing; err: null }
        | { call: null; err: { message: string; devices: { token: string; reason: string }[] } }
    > {
        const devices = params.fromTokens?.length
            ? params.fromTokens
                  .map((token) => this._devices.find((d) => d.token === token))
                  .filter((d): d is DeviceConnection => !!d)
            : this._devices;

        if (!devices.length) {
            return { call: null, err: { devices: [], message: "Nenhum dispositivo encontrado" } };
        }

        const device_errors: { token: string; reason: string }[] = [];

        for (const device of devices) {
            const { call, err } = await device.startCall(params.to);
            if (!call) {
                device_errors.push({ token: device.token, reason: err as string });
                continue;
            }

            return { call, err: null };
        }

        return { call: null, err: { message: "Não foi possível realizar a chamada", devices: device_errors } };
    }

    /**
     * Async generator that yields each device's call attempt result.
     */
    async *startCallIterator(params: {
        fromTokens?: string[];
        to: string;
    }): AsyncGenerator<
        { call: null; token: string; err: string },
        { call: CallOutgoing; token: string } | { call: null; err: string }
    > {
        const devices = params.fromTokens?.length
            ? params.fromTokens
                  .map((token) => this._devices.find((d) => d.token === token))
                  .filter((d): d is DeviceConnection => !!d)
            : this._devices;

        if (!devices.length) {
            return { call: null, err: "Nenhum dispositivo configurado" };
        }

        for (const device of devices) {
            const { call, err } = await device.startCall(params.to);
            if (!call) {
                yield { call: null, token: device.token, err: err as string };
                continue;
            }

            return { call, token: device.token };
        }

        return { call: null, err: "Não foi possível realizar a chamada" };
    }

    get devices(): Device[] {
        return this._devices.map((d) => DeviceProxy(d));
    }

    getDevices(): Device[] {
        return this._devices.map((d) => DeviceProxy(d));
    }

    /**
     * Add devices to instance.
     * @param tokens - Device tokens to add.
     */
    addDevices(tokens: string[] = []): Device[] {
        const added: DeviceConnection[] = [];
        for (const token of tokens) {
            if (this._devices.some((d) => d.token === token)) continue;
            const device = new DeviceConnection(this.mediaManager, token);
            this._devices.push(device);
            added.push(device);
            this.bindDeviceEvents(device);
        }
        return added.map((d) => DeviceProxy(d));
    }

    /**
     * Remove devices from instance by token.
     * @param tokens - Device tokens to remove.
     */
    removeDevices(tokens: string[]): Device[] {
        if (!tokens.length) return this._devices.map((d) => DeviceProxy(d));

        const remaining: DeviceConnection[] = [];
        for (const device of this._devices) {
            if (tokens.includes(device.token)) {
                device.disconnect();
                continue;
            }
            remaining.push(device);
        }
        this._devices = remaining;
        return this._devices.map((d) => DeviceProxy(d));
    }

    /**
     * Iteratively wakes up devices that are in hibernation.
     */
    async *wakeUpDevicesIterator(
        tokens: string[] = [],
    ): AsyncGenerator<{ token: string; waken: boolean }, void, unknown> {
        const devices = tokens.length ? this._devices.filter((d) => tokens.includes(d.token)) : this._devices;

        for (const device of devices) {
            const waken = await device.wakeUp();
            yield { token: device.token, waken };
        }
    }

    /**
     * Wakes up devices and returns an array of Promises resolving to wake results.
     */
    wakeUpDevices(tokens: string[] = []): Promise<{ token: string; waken: boolean }>[] {
        const devices = tokens.length ? this._devices.filter((d) => tokens.includes(d.token)) : this._devices;

        return devices.map((device) => device.wakeUp().then((waken) => ({ token: device.token, waken })));
    }

    private bindDeviceEvents(device: DeviceConnection) {
        device.on("offerReceived", (offer) => {
            this.emit("offer", offer);
        });
    }
}
