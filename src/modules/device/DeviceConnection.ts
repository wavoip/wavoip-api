import { SocketIoSignaling } from "@/adapters/socketio/SocketIoSignaling";
import { CallRegistry } from "@/application/call/CallRegistry";
import { CallSession, type CallSessionDeps, type TransportFactory } from "@/application/call/CallSession";
import type { MediaPlan, Peer } from "@/domain/call/types";
import { type CallOutgoing, CallOutgoingProxy } from "@/modules/call/CallOutgoing";
import { type Offer, OfferProxy } from "@/modules/call/Offer";
import { DeviceModel } from "@/modules/device/Device";
import type { ConnectionStatus, Contact, DeviceStatus } from "@/modules/device/Device";
import { type DeviceSocket, DeviceWebSocketFactory } from "@/modules/device/WebSocket";
import type { TransportOptions } from "@/modules/media/ITransport";
import type { MediaManager } from "@/modules/media/MediaManager";
import { WebRTCTransport } from "@/modules/media/WebRTC";
import { WebsocketTransport } from "@/modules/media/WebSocket";
import { warnDeprecated } from "@/modules/shared/deprecation";
import { EventEmitter, type Unsubscribe } from "@/modules/shared/EventEmitter";
import type { AxiosInstance } from "axios";
import axios from "axios";

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
    private readonly wss: DeviceSocket;
    private readonly api: AxiosInstance;
    private readonly signaling: SocketIoSignaling;
    private readonly registry: CallRegistry;
    private readonly callDeps: CallSessionDeps;

    private readonly device: DeviceModel;

    private _onStatusUnsub?: () => void;
    private _onQRCodeUnsub?: () => void;
    private _onContactUnsub?: () => void;
    private stopped = false;

    constructor(
        private readonly mediaManager: MediaManager,
        token: string,
        platform?: string,
        private readonly transportOptions?: TransportOptions,
    ) {
        super();

        this.device = new DeviceModel(token);
        this.api = axios.create({ baseURL: `https://devices.wavoip.com/${this.device.token}` });
        this.wss = DeviceWebSocketFactory(token, platform);
        this.signaling = new SocketIoSignaling(this.wss);
        this.registry = new CallRegistry(this.signaling);
        this.registry.start();
        this.callDeps = {
            signaling: this.signaling,
            transports: this.transportsFor(mediaManager),
            setLocalMuted: (muted) => mediaManager.setMuted(muted),
        };
        this.signaling.onOffer((offer) => this.onOffer(offer));
        this.wss.on("disconnect", this.onDisconnect.bind(this));

        this.wss.on("device:init", (status, callType, contact, qrCode, restricted, restrictedUntil, activeCalls) => {
            this.device.status = status;
            this.device.callType = callType;
            this.device.contact = contact ?? undefined;
            this.device.qrCode = qrCode ?? undefined;
            this.device.restricted = restricted;
            this.device.restrictedUntil = restrictedUntil ? new Date(restrictedUntil) : null;
            this.device.activeCalls = activeCalls ?? 0;
            if (this.device.connectionStatus !== "connected") {
                this.device.connectionStatus = "connected";
                this.emit("connectionStatusChanged", this.device.connectionStatus);
            }
            this.emit("statusChanged", this.device.status);
            this.emit("contactChanged", this.device.contact);
            this.emit("qrCodeChanged", this.device.qrCode);
            this.emit("restrictedChanged", this.device.restricted, this.device.restrictedUntil);
            this.emit("activeCallsChanged", this.device.activeCalls);
        });
        this.wss.on("device:calls", (count) => {
            this.device.activeCalls = count;
            this.emit("activeCallsChanged", count);
        });
        this.wss.on("device:restriction:changed", (restricted, restrictedUntil) => {
            this.device.restricted = restricted;
            this.device.restrictedUntil = restrictedUntil ? new Date(restrictedUntil) : null;
            this.emit("restrictedChanged", this.device.restricted, this.device.restrictedUntil);
        });
        this.wss.on("device:building", () => {
            this.device.status = "BUILDING";
            this.emit("statusChanged", this.device.status);
        });
        this.wss.on("device:open", (contact) => {
            this.device.status = "open";
            this.device.contact = contact;
            this.device.qrCode = undefined;
            this.emit("statusChanged", this.device.status);
            this.emit("contactChanged", this.device.contact);
            this.emit("qrCodeChanged", this.device.qrCode);
        });
        this.wss.on("device:connecting", (qrcode) => {
            this.device.status = "connecting";
            this.device.contact = undefined;
            this.device.qrCode = qrcode ?? undefined;
            this.device.restricted = false;
            this.device.restrictedUntil = null;
            this.emit("statusChanged", this.device.status);
            this.emit("contactChanged", this.device.contact);
            this.emit("qrCodeChanged", this.device.qrCode);
        });
        this.wss.on("device:close", () => {
            this.device.status = "close";
            this.device.contact = undefined;
            this.device.qrCode = undefined;
            this.device.restricted = false;
            this.device.restrictedUntil = null;
            this.emit("statusChanged", this.device.status);
            this.emit("contactChanged", this.device.contact);
            this.emit("qrCodeChanged", this.device.qrCode);
        });
        this.wss.on("device:restarting", () => {
            this.device.status = "restarting";
            this.emit("statusChanged", this.device.status);
        });
        this.wss.on("device:hibernating", () => {
            this.device.status = "hibernating";
            this.emit("statusChanged", this.device.status);
        });

        this.connect();
    }

    get token(): string {
        return this.device.token;
    }

    get qrCode(): string | undefined {
        return this.device.qrCode;
    }

    get contact(): Contact | undefined {
        return this.device.contact;
    }

    get status(): DeviceStatus {
        return this.device.status;
    }

    get connectionStatus(): ConnectionStatus {
        return this.device.connectionStatus;
    }

    get restricted(): boolean {
        return this.device.restricted;
    }

    get restrictedUntil(): Date | null {
        return this.device.restrictedUntil;
    }

    get activeCalls(): number {
        return this.device.activeCalls;
    }

    get socket(): DeviceSocket {
        return this.wss;
    }

    get media(): MediaManager {
        return this.mediaManager;
    }

    async startCall(to: string): Promise<{ call: CallOutgoing; err?: undefined } | { call?: undefined; err: string }> {
        const { err } = this.device.canCall();
        if (err) return { err };

        const dialed = await CallSession.dial(this.callDeps, {
            to,
            type: this.device.callType,
            deviceToken: this.device.token,
        });
        if (!dialed.session) return { err: dialed.err };

        this.registry.register(dialed.session);
        return { call: CallOutgoingProxy(dialed.session) };
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
        const infos = await this.getInfos();
        return !!infos;
    }

    async pairingCode(phone: string): Promise<{ pairingCode: string; err: null } | { pairingCode: null; err: string }> {
        const { promise, resolve } = Promise.withResolvers<
            { pairingCode: string; err: null } | { pairingCode: null; err: string }
        >();

        this.wss.emit("device.pairing_code", phone, (response) => {
            if (response.type === "error") resolve({ pairingCode: null, err: response.result });
            else resolve({ pairingCode: response.result as string, err: null });
        });

        return promise;
    }

    connect() {
        if (this.wss.connected) return;
        this.stopped = false;
        this.wss.connect();
    }

    disconnect() {
        this.stopped = true;
        // Sem guarda de `disconnected`: o socket.io diz `disconnected` enquanto ainda está
        // conectando, e a guarda deixaria a conexão em andamento terminar como socket órfão.
        // `disconnect()` é idempotente e aborta a conexão pendente.
        this.wss.disconnect();
    }

    async restart() {
        await this.api.get<{ result: string }>("/device/restart");
    }

    async logout() {
        await this.api.get<{ result: string }>("/whatsapp/logout");
    }

    private onDisconnect() {
        if (this.device.connectionStatus !== "disconnected") {
            this.device.connectionStatus = "disconnected";
            this.emit("connectionStatusChanged", this.device.connectionStatus);
        }
        if (this.stopped) return;
        if (this.wss.active) return;
        this.reconnect();
    }

    private reconnect(attempt = 1) {
        if (attempt === 3 || this.wss.connected || this.stopped) return;

        if (this.device.connectionStatus !== "reconnecting") {
            this.device.connectionStatus = "reconnecting";
            this.emit("connectionStatusChanged", this.device.connectionStatus);
        }

        setTimeout(async () => {
            if (this.stopped) return;
            const infos = await this.getInfos();
            if (this.stopped) return;
            if (!infos) return this.reconnect(attempt + 1);
            this.device.status = infos.status;
            this.emit("statusChanged", this.device.status);
            this.wss.connect();
        }, attempt * 1000);
    }

    async getInfos() {
        return this.api
            .get("/whatsapp/all_info")
            .then((res) => res.data.result)
            .catch(() => null);
    }

    private onOffer(offer: { id: string; peer: Peer; plan: MediaPlan }): void {
        const session = new CallSession(this.callDeps, {
            id: offer.id,
            type: this.device.callType,
            direction: "INCOMING",
            peer: offer.peer,
            deviceToken: this.device.token,
            status: "CALLING",
            remotePlan: offer.plan,
        });
        const release = this.registry.register(session);

        this.emit("offerReceived", OfferProxy(session, release));
    }

    private transportsFor(mediaManager: MediaManager): TransportFactory {
        return {
            offerer: () => new WebRTCTransport(mediaManager, undefined, this.transportOptions),
            forPlan: (plan, deviceToken) => {
                if (plan.type === "webRTC") return new WebRTCTransport(mediaManager, plan.sdp, this.transportOptions);
                if (plan.type === "relay") {
                    return new WebsocketTransport(mediaManager, plan, deviceToken, this.transportOptions);
                }
                throw new Error(`Unsupported media plan type: ${plan.type}`);
            },
        };
    }
}
