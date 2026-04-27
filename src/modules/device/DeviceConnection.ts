import { type CallActive, CallActiveProxy } from "@/modules/call/CallActive";
import { CallBus } from "@/modules/call/CallBus";
import { type CallOutgoing, CallOutgoingProxy } from "@/modules/call/CallOutgoing";
import { type Offer, OfferProxy } from "@/modules/call/Offer";
import { Call } from "@/modules/device/Call";
import { DeviceModel } from "@/modules/device/Device";
import type { Contact, DeviceStatus } from "@/modules/device/Device";
import { type DeviceSocket, DeviceWebSocketFactory } from "@/modules/device/WebSocket";
import type { MediaPlan, MediaPlanRelay, MediaPlanWebRTC } from "@/modules/device/WebSocket";
import type { MediaManager } from "@/modules/media/MediaManager";
import { WebRTCTransport } from "@/modules/media/WebRTC";
import { WebsocketTransport } from "@/modules/media/WebSocket";
import { EventEmitter, type Unsubscribe } from "@/modules/shared/EventEmitter";
import type { AxiosInstance } from "axios";
import axios from "axios";

export type DeviceEvents = {
    statusChanged: [status: DeviceStatus];
    qrCodeChanged: [qrCode?: string];
    contactChanged: [contact?: Contact];
};

type Events = DeviceEvents & {
    offerReceived: [offer: Offer];
};

export interface Device {
    readonly token: string;
    qrCode?: string;
    contact?: Contact;
    status: DeviceStatus;
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

    private readonly device: DeviceModel;
    private calls: Map<string, Call> = new Map();

    private _onStatusUnsub?: () => void;
    private _onQRCodeUnsub?: () => void;
    private _onContactUnsub?: () => void;

    constructor(
        private readonly mediaManager: MediaManager,
        token: string,
        platform?: string,
    ) {
        super();

        this.device = new DeviceModel(token);
        this.api = axios.create({ baseURL: `https://devices.wavoip.com/${this.device.token}` });
        this.wss = DeviceWebSocketFactory(token, platform);
        this.wss.on("disconnect", this.onDisconnect.bind(this));

        this.wss.on("device:init", (status, callType, contact, qrCode) => {
            this.device.status = status;
            this.device.callType = callType;
            this.device.contact = contact ?? undefined;
            this.device.qrCode = qrCode ?? undefined;
            this.emit("statusChanged", this.device.status);
            this.emit("contactChanged", this.device.contact);
            this.emit("qrCodeChanged", this.device.qrCode);
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
            this.emit("statusChanged", this.device.status);
            this.emit("contactChanged", this.device.contact);
            this.emit("qrCodeChanged", this.device.qrCode);
        });
        this.wss.on("device:close", () => {
            this.device.status = "close";
            this.device.contact = undefined;
            this.device.qrCode = undefined;
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

        this.wss.on("call:offer", this.onOffer.bind(this));

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

    get socket(): DeviceSocket {
        return this.wss;
    }

    get media(): MediaManager {
        return this.mediaManager;
    }

    async startCall(to: string): Promise<{ call: CallOutgoing; err?: undefined } | { call?: undefined; err: string }> {
        const { err } = this.device.canCall();
        if (err) return { err };

        const { promise, resolve } = Promise.withResolvers<
            { call: CallOutgoing; err?: undefined } | { call?: undefined; err: string }
        >();

        this.wss.emit("call.start", to, (response) => {
            if (response.type === "error") return resolve({ err: response.result });

            const { id, type, peer } = response.result;
            const call = new Call(id, type, "OUTGOING", peer, this.device.token, "RINGING");
            const bus = new CallBus(call, this.wss);
            bus.on("ended", () => this.calls.delete(id));
            bus.on("unanswered", () => this.calls.delete(id));
            bus.on("rejected", () => this.calls.delete(id));
            const outgoing = CallOutgoingProxy(call, bus, this.wss, this.mediaManager);
            this.calls.set(id, call);
            resolve({ call: outgoing });
        });

        return promise;
    }

    /** @deprecated Use `on("statusChanged", callback)` instead. */
    onStatus(cb: (status: DeviceStatus) => void): () => void {
        this._onStatusUnsub?.();
        this._onStatusUnsub = this.on("statusChanged", cb);
        return this._onStatusUnsub;
    }

    /** @deprecated Use `on("qrCodeChanged", callback)` instead. */
    onQRCode(cb: (qrcode?: string) => void): () => void {
        this._onQRCodeUnsub?.();
        this._onQRCodeUnsub = this.on("qrCodeChanged", cb);
        return this._onQRCodeUnsub;
    }

    /** @deprecated Use `on("contactChanged", callback)` instead. */
    onContact(cb: (contact?: Contact) => void): () => void {
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
        this.wss.connect();
    }

    disconnect() {
        if (this.wss.disconnected) return;
        this.wss.disconnect();
    }

    async restart() {
        await this.api.get<{ result: string }>("/device/restart");
    }

    async logout() {
        await this.api.get<{ result: string }>("/whatsapp/logout");
    }

    private onDisconnect() {
        this.device.status = "disconnected";
        if (this.wss.active) return;
        this.reconnect();
    }

    private reconnect(attempt = 1) {
        if (attempt === 3 || this.wss.connected) return;

        setTimeout(async () => {
            const infos = await this.getInfos();
            if (!infos) return this.reconnect(attempt + 1);
            this.device.status = infos.status;
            this.wss.connect();
        }, attempt * 1000);
    }

    async getInfos() {
        return this.api
            .get("/whatsapp/all_info")
            .then((res) => res.data.result)
            .catch(() => null);
    }

    private onOffer(
        offerProps: {
            id: string;
            peer: { phone: string; displayName: string | null; profilePicture: string | null };
            offer: MediaPlan;
        },
        ackOffer: () => void,
    ) {
        ackOffer();

        const call = this.device.receiveOffer(offerProps.id, this.device.callType, offerProps.peer);
        const bus = new CallBus(call, this.wss);
        bus.on("ended", () => this.calls.delete(call.id));
        bus.on("unanswered", () => this.calls.delete(call.id));

        const offer = OfferProxy(call, bus, {
            onAccept: (call) => {
                const mediaPlan = offerProps.offer;

                if (mediaPlan.type === "webRTC") {
                    return this.acceptWebRTCOffer(call, bus, mediaPlan);
                }

                if (mediaPlan.type === "relay") {
                    return this.acceptRelayOffer(call, bus, mediaPlan);
                }

                return Promise.reject("Unsupported media plan type");
            },
            onReject: (call) => {
                this.wss.emit("call.reject", call.id, () => {});
                this.calls.delete(call.id);
            },
        });

        this.calls.set(call.id, call);
        this.emit("offerReceived", offer);
    }

    private async acceptWebRTCOffer(call: Call, bus: CallBus, mediaPlan: MediaPlanWebRTC): Promise<CallActive> {
        const webRTC = new WebRTCTransport(this.mediaManager, mediaPlan.sdp);
        await webRTC.start();

        const answer = await webRTC.answer;
        this.wss.emit("call.accept", call.id, { type: "webRTC", sdp: answer.sdp as string }, () => {});
        bus.wireTransport(webRTC);

        return CallActiveProxy(call, bus, webRTC, this.mediaManager, {
            onEnd: (call) => {
                this.wss.emit("call.end", call.id, () => {
                    this.calls.delete(call.id);
                });
            },
        });
    }

    private acceptRelayOffer(call: Call, bus: CallBus, mediaPlan: MediaPlanRelay): Promise<CallActive> {
        const wsTransport = new WebsocketTransport(this.mediaManager, mediaPlan, call.deviceToken);
        call.accept();
        bus.wireTransport(wsTransport);
        const active = CallActiveProxy(call, bus, wsTransport, this.mediaManager, {
            onEnd: (call) => {
                this.wss.emit("call.end", call.id, () => {
                    this.calls.delete(call.id);
                });
            },
        });
        this.wss.emit("call.accept", call.id, { type: "none" }, () => {});
        wsTransport.start();
        return Promise.resolve(active);
    }
}
