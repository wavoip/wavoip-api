import { FetchDeviceApi } from "@/adapters/http/FetchDeviceApi";
import { SocketIoSignaling } from "@/adapters/socketio/SocketIoSignaling";
import { DeviceSession, type DeviceSessionEvents } from "@/application/device/DeviceSession";
import { type CallOutgoing, CallOutgoingProxy } from "@/modules/call/CallOutgoing";
import { type Offer, OfferProxy } from "@/modules/call/Offer";
import type { ConnectionStatus, Contact, DeviceStatus } from "@/modules/device/Device";
import { DeviceWebSocketFactory } from "@/modules/device/WebSocket";
import type { TransportOptions } from "@/modules/media/ITransport";
import type { MediaManager } from "@/modules/media/MediaManager";
import { WebRTCTransport } from "@/modules/media/webrtc/Transport";
import { WebsocketTransport } from "@/modules/media/relay/Transport";
import { warnDeprecated } from "@/modules/shared/deprecation";
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
    offerReceived: [offer: Offer];
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
    /** @deprecated Use `on("statusChanged", callback)` instead. */
    onStatus(cb: (status: DeviceStatus) => void): Unsubscribe;
    /** @deprecated Use `on("qrCodeChanged", callback)` instead. */
    onQRCode(cb: (qrcode?: string) => void): Unsubscribe;
    /** @deprecated Use `on("contactChanged", callback)` instead. */
    onContact(cb: (contact?: Contact) => void): Unsubscribe;
    restart(): Promise<void>;
    logout(): Promise<void>;
    wakeUp(): Promise<boolean>;
    pairingCode(phone: string): Promise<{ pairingCode: string; err: null } | { pairingCode: null; err: string }>;
}

export class DeviceConnection extends EventEmitter<Events> implements Device {
    private readonly session: DeviceSession;

    private _onStatusUnsub?: () => void;
    private _onQRCodeUnsub?: () => void;
    private _onContactUnsub?: () => void;

    constructor(mediaManager: MediaManager, token: string, platform?: string, transportOptions?: TransportOptions) {
        super();

        const signaling = new SocketIoSignaling(DeviceWebSocketFactory(token, platform));
        this.session = new DeviceSession(
            {
                signaling,
                api: new FetchDeviceApi(token),
                transports: transportsFor(mediaManager, token, transportOptions),
                setLocalMuted: (muted) => mediaManager.setMuted(muted),
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

    async startCall(to: string): Promise<{ call: CallOutgoing; err?: undefined } | { call?: undefined; err: string }> {
        const started = await this.session.startCall(to);
        if (started.error) return { err: started.error.code };
        return { call: CallOutgoingProxy(started.data) };
    }

    onStatus(cb: (status: DeviceStatus) => void): () => void {
        warnDeprecated("Device.onStatus", 'use `device.on("statusChanged", cb)` instead.');
        this._onStatusUnsub?.();
        this._onStatusUnsub = this.on("statusChanged", cb);
        return this._onStatusUnsub;
    }

    onQRCode(cb: (qrcode?: string) => void): () => void {
        warnDeprecated("Device.onQRCode", 'use `device.on("qrCodeChanged", cb)` instead.');
        this._onQRCodeUnsub?.();
        this._onQRCodeUnsub = this.on("qrCodeChanged", cb);
        return this._onQRCodeUnsub;
    }

    onContact(cb: (contact?: Contact) => void): () => void {
        warnDeprecated("Device.onContact", 'use `device.on("contactChanged", cb)` instead.');
        this._onContactUnsub?.();
        this._onContactUnsub = this.on("contactChanged", cb);
        return this._onContactUnsub;
    }

    async wakeUp(): Promise<boolean> {
        const woken = await this.session.wakeUp();
        return woken.error === null;
    }

    async pairingCode(phone: string): Promise<{ pairingCode: string; err: null } | { pairingCode: null; err: string }> {
        const code = await this.session.pairingCode(phone);
        if (code.error) return { pairingCode: null, err: code.error.code };
        return { pairingCode: code.data, err: null };
    }

    connect(): void {
        this.session.connect();
    }

    disconnect(): void {
        this.session.disconnect();
    }

    async restart(): Promise<void> {
        await this.session.restart();
    }

    async logout(): Promise<void> {
        await this.session.logout();
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
        this.session.on("offerReceived", (call) => this.emit("offerReceived", OfferProxy(call)));
    }
}

/**
 * O device decide o transporte da chamada que sai: OFFICIAL fala WebRTC, UNOFFICIAL fala
 * relay. Na oferta recebida, quem decide é o plano que veio nela.
 */
function transportsFor(mediaManager: MediaManager, token: string, options?: TransportOptions): TransportFactory {
    return {
        forCall: (type) =>
            type === "OFFICIAL"
                ? new WebRTCTransport(mediaManager, undefined, options)
                : new WebsocketTransport(mediaManager, token, options),
        forOffer: (plan, deviceToken) => {
            if (plan.type === "webRTC") return new WebRTCTransport(mediaManager, plan.sdp, options);
            if (plan.type === "relay") {
                const relay = new WebsocketTransport(mediaManager, deviceToken, options);
                relay.useRelay(plan);
                return relay;
            }
            throw new Error(`Unsupported media plan type: ${plan.type}`);
        },
    };
}
