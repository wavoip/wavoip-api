import { FetchDeviceApi } from "@/adapters/http/FetchDeviceApi";
import { SocketIoSignaling } from "@/adapters/socketio/SocketIoSignaling";
import { DeviceSession, type DeviceSessionEvents } from "@/application/device/DeviceSession";
import type { CommandFailure, DeviceApiFailure, StartCallErrorCode, WavoipError } from "@/domain/shared/errors";
import { Result } from "@/domain/shared/Result";
import { type OutgoingCall, OutgoingCallProxy } from "@/modules/call/OutgoingCall";
import { type IncomingCall, IncomingCallProxy } from "@/modules/call/IncomingCall";
import type { ConnectionStatus, Contact, DeviceStatus } from "@/modules/device/Device";
import { DeviceWebSocketFactory } from "@/modules/device/WebSocket";
import type { TransportOptions } from "@/modules/media/ITransport";
import type { WavoipRuntime } from "@/ports/WavoipRuntime";
import { WebRTCTransport } from "@/modules/media/webrtc/Transport";
import { WebsocketTransport } from "@/modules/media/relay/Transport";
import { EventEmitter, type Unsubscribe } from "@/modules/shared/EventEmitter";
import { forwardEvents } from "@/modules/shared/forwardEvents";
import type { TransportFactory } from "@/application/call/CallSession";

export type DeviceEvents = {
    statusChanged: [status: DeviceStatus];
    connectionStatusChanged: [status: ConnectionStatus];
    qrCodeChanged: [qrCode?: string];
    contactChanged: [contact?: Contact];
    restrictedChanged: [restricted: boolean, restrictedUntil: Date | null];
    activeCallsChanged: [count: number];
};

type Events = DeviceEvents & {
    incomingCall: [offer: IncomingCall];
};

export interface Device {
    readonly token: string;
    qrCode?: string;
    contact?: Contact;
    status: DeviceStatus;
    connectionStatus: ConnectionStatus;
    restricted: boolean;
    restrictedUntil: Date | null;
    activeCalls: number;
    on<T extends keyof DeviceEvents>(event: T, callback: (...args: DeviceEvents[T]) => void): Unsubscribe;
    restart(): Promise<Result<void, DeviceApiFailure>>;
    logout(): Promise<Result<void, DeviceApiFailure>>;
    wakeUp(): Promise<Result<void, DeviceApiFailure>>;
    pairingCode(phone: string): Promise<Result<string, CommandFailure>>;
}

export class DeviceConnection extends EventEmitter<Events> implements Device {
    private readonly session: DeviceSession;

    constructor(runtime: WavoipRuntime, token: string, platform?: string, transportOptions?: TransportOptions) {
        super();

        const signaling = new SocketIoSignaling(DeviceWebSocketFactory(token, platform));
        this.session = new DeviceSession(
            {
                signaling,
                api: new FetchDeviceApi(token),
                transports: transportsFor(runtime, token, transportOptions),
                setLocalMuted: (muted) => runtime.microphone.setMuted(muted),
            },
            token,
        );

        this.forwardSessionEvents();
        this.connect();
    }

    get token(): string {
        return this.session.state.token;
    }

    get qrCode(): string | undefined {
        return this.session.state.qrCode;
    }

    get contact(): Contact | undefined {
        return this.session.state.contact;
    }

    get status(): DeviceStatus {
        return this.session.state.status;
    }

    get connectionStatus(): ConnectionStatus {
        return this.session.state.connectionStatus;
    }

    get restricted(): boolean {
        return this.session.state.restricted;
    }

    get restrictedUntil(): Date | null {
        return this.session.state.restrictedUntil;
    }

    get activeCalls(): number {
        return this.session.state.activeCalls;
    }

    async startCall(to: string): Promise<Result<OutgoingCall, WavoipError<StartCallErrorCode>>> {
        const started = await this.session.startCall(to);
        if (started.error) return started;
        return Result.ok(OutgoingCallProxy(started.data));
    }

    wakeUp(): Promise<Result<void, DeviceApiFailure>> {
        return this.session.wakeUp();
    }

    pairingCode(phone: string): Promise<Result<string, CommandFailure>> {
        return this.session.pairingCode(phone);
    }

    connect(): void {
        this.session.connect();
    }

    disconnect(): void {
        this.session.disconnect();
    }

    restart(): Promise<Result<void, DeviceApiFailure>> {
        return this.session.restart();
    }

    logout(): Promise<Result<void, DeviceApiFailure>> {
        return this.session.logout();
    }

    private forwardSessionEvents(): void {
        forwardEvents<DeviceSessionEvents, Events>(this.session, this, {
            statusChanged: "statusChanged",
            connectionStatusChanged: "connectionStatusChanged",
            qrCodeChanged: "qrCodeChanged",
            contactChanged: "contactChanged",
            restrictedChanged: "restrictedChanged",
            activeCallsChanged: "activeCallsChanged",
        });
        this.session.on("incomingCall", (call) => this.emit("incomingCall", IncomingCallProxy(call)));
    }
}

/**
 * O device decide o transporte da chamada que sai: OFFICIAL fala WebRTC, UNOFFICIAL fala
 * relay. Na oferta recebida, quem decide é o plano que veio nela.
 */
function transportsFor(runtime: WavoipRuntime, token: string, options?: TransportOptions): TransportFactory {
    return {
        forCall: (type) =>
            type === "OFFICIAL"
                ? new WebRTCTransport(runtime, undefined, options)
                : new WebsocketTransport(runtime, token),
        forOffer: (plan, deviceToken) => {
            if (plan.type === "webRTC") return new WebRTCTransport(runtime, plan.sdp, options);
            if (plan.type === "relay") {
                const relay = new WebsocketTransport(runtime, deviceToken);
                relay.useRelay(plan);
                return relay;
            }
            throw new Error(`Unsupported media plan type: ${plan.type}`);
        },
    };
}
