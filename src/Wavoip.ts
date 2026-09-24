import type { AudioControl } from "@/modules/audio/AudioControl";
import type { DeviceApiFailure, DeviceAttempt, StartCallFailure } from "@/domain/shared/errors";
import { Result } from "@/domain/shared/Result";
import type { OutgoingCall } from "@/modules/call/OutgoingCall";
import type { IncomingCall } from "@/modules/call/IncomingCall";
import { type Device, DeviceConnection } from "@/modules/device/DeviceConnection";
import { DeviceProxy } from "@/modules/device/DeviceProxy";
import type { IceConfig } from "@/modules/media/ICEDiagnostics";
import type { TransportOptions } from "@/modules/media/ITransport";
import { MediaManager } from "@/modules/media/MediaManager";
import { EventEmitter, type Unsubscribe } from "@/modules/shared/EventEmitter";

type Events = {
    offer: [offer: IncomingCall];
};

/** What waking one device answered. */
export type DeviceWakeUp = { readonly token: string; readonly result: Result<void, DeviceApiFailure> };

export class Wavoip {
    /** The audio devices the library can see. */
    readonly audio: AudioControl;

    private readonly mediaManager: MediaManager;
    private readonly transportOptions?: TransportOptions;
    private readonly platform?: string;
    private _devices: DeviceConnection[] = [];
    // Composição, e não herança: herdar do EventEmitter poria `emit` e `removeAllListeners`
    // na mão do integrador, que poderia forjar uma oferta ou desligar os nossos listeners.
    private readonly events = new EventEmitter<Events>();

    constructor(params: {
        tokens: string[];
        platform?: string;
        iceConfig?: IceConfig;
    }) {

        this.mediaManager = new MediaManager();
        // O `MediaManager` é quem enxerga os aparelhos; o tipo do campo é o que o
        // integrador vê, e por ele só dá para listar e ler o que está em uso.
        this.audio = this.mediaManager;
        this.transportOptions = collectTransportOptions(params);
        this.platform = params.platform;

        for (const token of [...new Set(params.tokens)]) {
            const device = new DeviceConnection(this.mediaManager, token, this.platform, this.transportOptions);
            this.bindDeviceEvents(device);
            this._devices.push(device);
        }
    }

    /**
     * Attempts to start an outgoing call using one or more available devices.
     *
     * Tries each device in sequence until one successfully initiates a call.
     * If all devices fail, returns a detailed error report listing reasons per device.
     */
    async startCall(params: { fromTokens?: string[]; to: string }): Promise<Result<OutgoingCall, StartCallFailure>> {
        const devices = this.devicesFor(params.fromTokens);
        if (!devices.length) return { data: null, error: { code: "NO_DEVICES", devices: [] } };

        const attempts: DeviceAttempt[] = [];
        for (const device of devices) {
            const started = await device.startCall(params.to);
            if (!started.error) return Result.ok(started.data);
            attempts.push({ token: device.token, error: started.error });
        }

        return { data: null, error: { ...attempts[0].error, devices: attempts } };
    }

    /**
     * Async generator that yields each device's call attempt result.
     */
    async *startCallIterator(params: {
        fromTokens?: string[];
        to: string;
    }): AsyncGenerator<DeviceAttempt, Result<OutgoingCall, StartCallFailure>> {
        const devices = this.devicesFor(params.fromTokens);
        if (!devices.length) return { data: null, error: { code: "NO_DEVICES", devices: [] } };

        const attempts: DeviceAttempt[] = [];
        for (const device of devices) {
            const started = await device.startCall(params.to);
            if (!started.error) return Result.ok(started.data);

            const attempt: DeviceAttempt = { token: device.token, error: started.error };
            attempts.push(attempt);
            yield attempt;
        }

        return { data: null, error: { ...attempts[0].error, devices: attempts } };
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
            const device = new DeviceConnection(this.mediaManager, token, this.platform, this.transportOptions);
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
    async *wakeUpDevicesIterator(tokens: string[] = []): AsyncGenerator<DeviceWakeUp, void, unknown> {
        const devices = tokens.length ? this._devices.filter((d) => tokens.includes(d.token)) : this._devices;

        for (const device of devices) {
            yield { token: device.token, result: await device.wakeUp() };
        }
    }

    /**
     * Wakes up devices and returns an array of Promises resolving to wake results.
     */
    wakeUpDevices(tokens: string[] = []): Promise<DeviceWakeUp>[] {
        const devices = tokens.length ? this._devices.filter((d) => tokens.includes(d.token)) : this._devices;

        return devices.map((device) => device.wakeUp().then((result) => ({ token: device.token, result })));
    }

    private devicesFor(tokens?: string[]): DeviceConnection[] {
        // Sem `fromTokens`, todos; com ele, só os que existem, na ordem pedida.
        if (!tokens?.length) return this._devices;
        return tokens
            .map((token) => this._devices.find((d) => d.token === token))
            .filter((device): device is DeviceConnection => !!device);
    }

    on<T extends keyof Events>(event: T, callback: (...args: Events[T]) => void): Unsubscribe {
        return this.events.on(event, callback);
    }

    private bindDeviceEvents(device: DeviceConnection) {
        device.on("incomingCall", (offer) => this.events.emit("offer", offer));
    }
}

function collectTransportOptions(params: {
    iceConfig?: IceConfig;
}): TransportOptions | undefined {
    const out: TransportOptions = {};
    if (params.iceConfig) out.iceConfig = params.iceConfig;
    return Object.keys(out).length ? out : undefined;
}
