import type { AudioControl } from "@/domain/audio/control";
import type { DeviceApiFailure, DeviceAttempt, StartCallFailure } from "@/domain/shared/errors";
import { Result } from "@/domain/shared/Result";
import { type OutgoingCall, OutgoingCallProxy } from "@/modules/call/OutgoingCall";
import { type IncomingCall, IncomingCallProxy } from "@/modules/call/IncomingCall";
import type { Device } from "@/domain/device/Device";

import type { IceConfig } from "@/modules/media/ICEDiagnostics";
import type { TransportOptions } from "@/modules/media/ITransport";
import { FetchDeviceApi } from "@/adapters/http/FetchDeviceApi";
import { DeviceWebSocketFactory } from "@/adapters/socketio/DeviceSocket";
import { SocketIoSignaling } from "@/adapters/socketio/SocketIoSignaling";
import type { TransportFactory } from "@/application/call/CallSession";
import { DeviceSession } from "@/application/device/DeviceSession";
import { WebsocketTransport } from "@/modules/media/relay/Transport";
import { WebRTCTransport } from "@/modules/media/webrtc/Transport";
import type { WavoipRuntime } from "@/ports/WavoipRuntime";
import { EventEmitter, type Unsubscribe } from "@/modules/shared/EventEmitter";

type Events = {
    offer: [offer: IncomingCall];
};

/** What waking one device answered. */
export type DeviceWakeUp = { readonly token: string; readonly result: Result<void, DeviceApiFailure> };

export class Wavoip {
    /** The audio devices the library can see. */
    readonly audio: AudioControl;

    private readonly runtime: WavoipRuntime;
    private readonly transportOptions?: TransportOptions;
    private readonly platform?: string;
    private _devices: DeviceSession[] = [];
    // Composição, e não herança: herdar do EventEmitter poria `emit` e `removeAllListeners`
    // na mão do integrador, que poderia forjar uma oferta ou desligar os nossos listeners.
    private readonly events = new EventEmitter<Events>();

    constructor(params: {
        tokens: string[];
        platform?: string;
        iceConfig?: IceConfig;
        /**
         * The platform to run on. Import one: `webRuntime()` from the browser adapter,
         * or the React Native / Node.js one (DEV-277).
         */
        runtime: WavoipRuntime;
    }) {
        this.runtime = params.runtime;
        // O tipo do campo é o que o integrador vê: por ele só dá para listar os aparelhos e
        // ler o que está em uso.
        this.audio = this.runtime.audio;
        this.transportOptions = collectTransportOptions(params);
        this.platform = params.platform;

        for (const token of [...new Set(params.tokens)]) {
            const device = this.connect(token);
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
            if (!started.error) return Result.ok(OutgoingCallProxy(started.data));
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
            if (!started.error) return Result.ok(OutgoingCallProxy(started.data));

            const attempt: DeviceAttempt = { token: device.token, error: started.error };
            attempts.push(attempt);
            yield attempt;
        }

        return { data: null, error: { ...attempts[0].error, devices: attempts } };
    }

    get devices(): Device[] {
        return [...this._devices];
    }

    getDevices(): Device[] {
        return [...this._devices];
    }

    /**
     * Add devices to instance.
     * @param tokens - Device tokens to add.
     */
    addDevices(tokens: string[] = []): Device[] {
        const added: DeviceSession[] = [];
        for (const token of tokens) {
            if (this._devices.some((d) => d.token === token)) continue;
            const device = this.connect(token);
            this._devices.push(device);
            added.push(device);
            this.bindDeviceEvents(device);
        }
        return [...added];
    }

    /**
     * Remove devices from instance by token.
     * @param tokens - Device tokens to remove.
     */
    removeDevices(tokens: string[]): Device[] {
        if (!tokens.length) return [...this._devices];

        const remaining: DeviceSession[] = [];
        for (const device of this._devices) {
            if (tokens.includes(device.token)) {
                device.disconnect();
                continue;
            }
            remaining.push(device);
        }
        this._devices = remaining;
        return [...this._devices];
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

    private devicesFor(tokens?: string[]): DeviceSession[] {
        // Sem `fromTokens`, todos; com ele, só os que existem, na ordem pedida.
        if (!tokens?.length) return this._devices;
        return tokens
            .map((token) => this._devices.find((d) => d.token === token))
            .filter((device): device is DeviceSession => !!device);
    }

    on<T extends keyof Events>(event: T, callback: (...args: Events[T]) => void): Unsubscribe {
        return this.events.on(event, callback);
    }

    private connect(token: string): DeviceSession {
        // O raiz de composição: é o único lugar que escolhe implementação. A sessão só
        // conhece portas, e é por isto que ela roda igual em qualquer plataforma.
        const session = new DeviceSession(
            {
                signaling: new SocketIoSignaling(DeviceWebSocketFactory(token, this.platform)),
                api: new FetchDeviceApi(token),
                transports: this.transportsFor(token),
                setLocalMuted: (muted) => this.runtime.microphone.setMuted(muted),
            },
            token,
        );

        session.connect();
        return session;
    }

    private transportsFor(token: string): TransportFactory {
        // O device decide o transporte da chamada que sai: OFFICIAL fala WebRTC, UNOFFICIAL
        // fala relay. Na oferta recebida, quem decide é o plano que veio nela.
        const { runtime, transportOptions } = this;
        return {
            forCall: (type) =>
                type === "OFFICIAL"
                    ? new WebRTCTransport(runtime, undefined, transportOptions)
                    : new WebsocketTransport(runtime, token),
            forOffer: (plan, deviceToken) => {
                if (plan.type === "webRTC") return new WebRTCTransport(runtime, plan.sdp, transportOptions);
                if (plan.type === "relay") {
                    const relay = new WebsocketTransport(runtime, deviceToken);
                    relay.useRelay(plan);
                    return relay;
                }
                throw new Error(`Unsupported media plan type: ${plan.type}`);
            },
        };
    }

    // A sessão fala em chamada crua; quem a veste para o integrador é aqui, que é onde o
    // evento público nasce.
    private bindDeviceEvents(device: DeviceSession) {
        device.on("incomingCall", (call) => this.events.emit("offer", IncomingCallProxy(call)));
    }
}

function collectTransportOptions(params: {
    iceConfig?: IceConfig;
}): TransportOptions | undefined {
    const out: TransportOptions = {};
    if (params.iceConfig) out.iceConfig = params.iceConfig;
    return Object.keys(out).length ? out : undefined;
}
