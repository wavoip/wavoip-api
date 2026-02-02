import { EventEmitter } from "@/features/EventEmitter";
import type { CallPeer, CallTransport, CallType } from "@/features/call/types/call";
import type { DeviceStatus } from "@/features/device/types/device";
import type { DeviceAllInfo } from "@/features/device/types/device-all-info";
import type { DeviceSocket } from "@/features/device/types/socket";
import axios, { type AxiosInstance } from "axios";
import { io } from "socket.io-client";

type Events = {
    status: [status: DeviceStatus | null];
    qrcode: [qrcode: string | null];
    contact: [type: CallType, contact: { phone: string } | null];
};

export class DeviceManager extends EventEmitter<Events> {
    public readonly socket: DeviceSocket;
    public readonly token: string;
    public qrcode: string | null = null;
    public status: DeviceStatus | null = "disconnected";
    public contact: { [k in CallType]: { phone: string } | null } = { official: null, unofficial: null };

    private api: AxiosInstance;

    constructor(device_token: string) {
        super();

        this.token = device_token;
        this.api = axios.create({ baseURL: `https://devices.wavoip.com/${this.token}` });

        this.socket = io("https://devices.wavoip.com", {
            transports: ["websocket"],
            path: `/${device_token}/websocket`,
            autoConnect: false,
            auth: { version: "official" },
        });

        this.socket.on("device:qrcode", (qrcode) => {
            this.qrcode = qrcode;
            this.emit("qrcode", qrcode);
        });

        this.socket.on("device:status", (status) => {
            this.status = status;
            this.emit("status", status);
        });

        this.socket.on("device:contact", (type, contact) => {
            this.contact[type] = contact;
            this.emit("contact", type, contact);
        });

        this.socket.on("disconnect", () => {
            if (this.socket.active) {
                return;
            }

            this.status = "disconnected";
            this.emit("status", this.status);

            this.getInfos().then((infos) => {
                if (!infos) {
                    return;
                }

                this.status = infos.status;
                this.emit("status", this.status);
            });
        });

        this.tryToConnect().then((infos) => {
            if (!infos) {
                this.status = "error";
                this.emit("status", this.status);
                return;
            }

            this.status = infos.status;
            this.emit("status", this.status);
            this.socket.connect();
        });
    }

    canCall() {
        if (!this.status) {
            return { err: "Dispositivo não está pronto para ligar" };
        }

        if (this.status === "error") {
            return { err: "Erro no dispositivo" };
        }

        if (this.status === "connecting") {
            return { err: "É preciso vincular um número ao dispositivo" };
        }

        if (this.status === "restarting") {
            return { err: "Dispositivo está sendo reiniciado" };
        }

        return { err: null };
    }

    startCall(whatsapp_id: string) {
        return new Promise<
            { call: { id: string; peer: CallPeer; transport: CallTransport }; err: null } | { call: null; err: string }
        >((resolve) => {
            this.socket.emit("call:start", whatsapp_id, (res) => {
                if (res.type === "error") {
                    return resolve({ call: null, err: res.result });
                }

                resolve({
                    call: {
                        id: res.result.id,
                        peer: res.result.peer,
                        transport: res.result.transport,
                    },
                    err: null,
                });
            });
        });
    }

    endCall() {
        return new Promise<{ err: null | string }>((resolve) => {
            this.socket.emit("call:end", (res) => {
                if (res.type === "success") {
                    resolve({ err: null });
                } else {
                    resolve({ err: res.result });
                }
            });
        });
    }

    acceptCall(params: { call_id: string }) {
        return new Promise<{ transport: CallTransport; err: null } | { transport: null; err: string }>((resolve) => {
            this.socket.emit("call:accept", { id: params.call_id }, (res) => {
                if (res.type === "error") {
                    resolve({ transport: null, err: res.result });
                    return;
                }

                resolve({ transport: res.result, err: null });
            });
        });
    }

    sendSdpAnswer(answer: RTCSessionDescriptionInit) {
        this.socket.emit("call:sdp-answer", answer);
    }

    rejectCall(call_id: string) {
        return new Promise<{ err: null | string }>((resolve) => {
            this.socket.emit("call:reject", call_id, (res) => {
                if (res.type === "success") {
                    resolve({ err: null });
                } else {
                    resolve({ err: res.result });
                }
            });
        });
    }

    mute() {
        return new Promise<{ err: null | string }>((resolve) => {
            this.socket.emit("call:mute", (res) => {
                if (res.type === "success") {
                    resolve({ err: null });
                } else {
                    resolve({ err: res.result });
                }
            });
        });
    }

    unMute() {
        return new Promise<{ err: null | string }>((resolve) => {
            this.socket.emit("call:unmute", (res) => {
                if (res.type === "success") {
                    resolve({ err: null });
                } else {
                    resolve({ err: res.result });
                }
            });
        });
    }

    requestPairingCode(phone: string) {
        return new Promise<{ pairingCode: string; err: null } | { pairingCode: null; err: string }>((resolve) => {
            this.socket.emit("whatsapp:pairing_code", phone, (res) => {
                if (res.type === "error") {
                    return resolve({ pairingCode: null, err: res.result });
                }

                resolve({ pairingCode: res.result, err: null });
            });
        });
    }

    async getInfos() {
        return this.api
            .get<{ result: DeviceAllInfo }>("/whatsapp/all_info")
            .then((res) => res.data.result)
            .catch(() => null);
    }

    async restart() {
        return this.api
            .get<{ result: string }>("/device/restart")
            .then((res) => res.data.result)
            .catch(() => null);
    }

    async logout() {
        return this.api
            .get<{ result: string }>("/whatsapp/logout")
            .then((res) => res.data.result)
            .catch(() => null);
    }

    private async tryToConnect() {
        let allInfo: DeviceAllInfo | null = null;

        while (true) {
            allInfo = await this.api
                .get<{ result: DeviceAllInfo }>("/whatsapp/all_info")
                .then((res) => res.data.result)
                .catch(() => null);

            if (allInfo) break;

            await new Promise<void>((resolve) => setTimeout(() => resolve(), 3_000));
        }

        return allInfo;
    }
}
