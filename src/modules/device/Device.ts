import { Call, type CallType, type Peer } from "@/modules/device/Call";
import { t } from "@/modules/shared/i18n";

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

export class DeviceModel {
    public qrCode?: string = undefined;
    public contact?: Contact;
    public status: DeviceStatus = "disconnected";
    public callType: CallType = "OFFICIAL";
    public restricted = false;

    constructor(public readonly token: string) {}

    receiveOffer(id: string, type: CallType, peer: Peer) {
        const offer = Call.CreateOffer(id, type, peer, this.token);
        return offer;
    }

    canCall(): { err?: string } {
        if (this.status === "error") {
            return { err: t("Device error") };
        }

        if (this.status === "connecting") {
            return { err: t("A phone number must be linked to the device") };
        }

        if (this.status === "restarting") {
            return { err: t("Device is restarting") };
        }

        if (this.restricted) {
            return { err: t("Device is restricted") };
        }

        return {};
    }
}
