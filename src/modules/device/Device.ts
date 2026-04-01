import { Call, type CallType, type Peer } from "@/modules/device/Call";

export type DeviceStatus =
    | "UP"
    | "disconnected"
    | "close"
    | "connecting"
    | "open"
    | "error"
    | "restarting"
    | "hibernating"
    | "BUILDING"
    | "WAITING_PAYMENT"
    | "EXTERNAL_INTEGRATION_ERROR";

export type Contact = { phone: string };
export type DeviceContact = Partial<{ [k in CallType]: Contact }>;

export class DeviceModel {
    public qrCode?: string = undefined;
    public contact: DeviceContact = {};
    public status: DeviceStatus = "disconnected";

    constructor(public readonly token: string) {}

    receiveOffer(id: string, type: CallType, peer: Peer) {
        const offer = Call.CreateOffer(id, type, peer, this.token);
        return offer;
    }

    canCall(): { err?: string } {
        if (this.status === "error") {
            return { err: "Erro no dispositivo" };
        }

        if (this.status === "connecting") {
            return { err: "É preciso vincular um número ao dispositivo" };
        }

        if (this.status === "restarting") {
            return { err: "Dispositivo está sendo reiniciado" };
        }

        return {};
    }
}
