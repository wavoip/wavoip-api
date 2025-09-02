import axios from "axios";
import { io } from "socket.io-client";
import type { DeviceStatus } from "@/features/device/types/device";
import type { DeviceAllInfo } from "@/features/device/types/device-all-info";
import type { DeviceCallbacks } from "@/features/device/types/device-callbacks";
import type { DeviceSocket } from "@/features/device/types/socket";

export class DeviceManager {
    public readonly socket: DeviceSocket;
    public readonly token: string;
    public qrcode: string | null = null;
    public status: DeviceStatus | null = null;

    public callbacks: DeviceCallbacks = {};

    constructor(device_token: string) {
        this.token = device_token;

        this.socket = io("https://devices.wavoip.com", {
            transports: ["websocket"],
            path: `/${device_token}/websocket`,
            autoConnect: false,
        });

        this.socket.on("qrcode", (qrcode) => {
            this.qrcode = qrcode;
            this.callbacks.onQRCode?.(qrcode);
        });

        this.socket.on("device_status", (status) => {
            this.status = status;
            this.callbacks.onStatus?.(status);
        });

        this.socket.on("disconnect", () => {
            if (!this.socket.active) {
                this.status = "close";
                this.callbacks.onStatus?.("close");
            }
        });

        this.getInfos().then(() => this.socket.connect());
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

        return { err: null };
    }

    startCall(whatsapp_id: string) {
        return new Promise<{ call_id: string; err: null } | { call_id: null; err: string }>((resolve) => {
            this.socket.emit("calls:start", whatsapp_id, (res) => {
                if (res.type === "success") {
                    return resolve({ err: null, call_id: res.result.call_id });
                }

                resolve({ call_id: null, err: res.result });
            });
        });
    }

    endCall() {
        return new Promise<{ err: null | string }>((resolve) => {
            this.socket.emit("calls:end", (res) => {
                if (res.type === "success") {
                    resolve({ err: null });
                } else {
                    resolve({ err: res.result });
                }
            });
        });
    }

    acceptCall(call_id: string) {
        return new Promise<{ err: null | string }>((resolve) => {
            this.socket.emit("calls:accept", call_id, (res) => {
                if (res.type === "success") {
                    resolve({ err: null });
                } else {
                    resolve({ err: res.result });
                }
            });
        });
    }

    rejectCall(call_id: string) {
        return new Promise<{ err: null | string }>((resolve) => {
            this.socket.emit("calls:reject", call_id, (res) => {
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
            this.socket.emit("calls:mute", (res) => {
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
            this.socket.emit("calls:unmute", (res) => {
                if (res.type === "success") {
                    resolve({ err: null });
                } else {
                    resolve({ err: res.result });
                }
            });
        });
    }

    async getInfos() {
        return axios
            .get<DeviceAllInfo>(`https://devices.wavoip.com/${this.token}/whatsapp/all_info`)
            .then((res) => res.data)
            .catch(() => null);
    }
}
