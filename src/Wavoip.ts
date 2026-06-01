import type { CallOutgoing } from "@/modules/call/CallOutgoing";
import type { Offer } from "@/modules/call/Offer";
import { type Device, DeviceConnection } from "@/modules/device/DeviceConnection";
import { DeviceProxy } from "@/modules/device/DeviceProxy";
import { MediaManager } from "@/modules/media/MediaManager";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import { type Language, setLanguage } from "@/modules/shared/i18n";

type Events = {
    offer: [offer: Offer];
    micChanged: [device: MediaDeviceInfo | null];
    devicesChanged: [devices: MediaDeviceInfo[]];
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
        this.mediaManager.on("micChanged", (device) => this.emit("micChanged", device));
        this.mediaManager.on("devicesChanged", (devices) => this.emit("devicesChanged", devices));

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
     * Switch the active microphone. If a call is in progress, the new device
     * is hot-swapped into the live stream without interrupting audio.
     * Returns `{ err: null }` on success or `{ err: string }` if the device id
     * is not in the current device list.
     */
    async setMicrophone(deviceId: string): Promise<{ err: string | null }> {
        const ok = await this.mediaManager.setMicrophone(deviceId);
        return ok ? { err: null } : { err: `Microphone not found: ${deviceId}` };
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
