import { Call, type CallType, type Peer } from "@/modules/device/Call";
import { t } from "@/modules/shared/i18n";

/**
 * Account-level device status. WebSocket transport state is tracked separately
 * via `ConnectionStatus` and `connectionStatusChanged`.
 */
export type DeviceStatus =
    | "UP"
    | "close"
    | "connecting"
    | "open"
    | "error"
    | "restarting"
    | "hibernating"
    | "BUILDING"
    | "WAITING_PAYMENT"
    | "EXTERNAL_INTEGRATION_ERROR";

/** WebSocket transport state, independent of the account-level `DeviceStatus`. */
export type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

export type Contact = { phone: string };

export class DeviceModel {
    public qrCode?: string = undefined;
    public contact?: Contact;
    public status: DeviceStatus = "BUILDING";
    public connectionStatus: ConnectionStatus = "disconnected";
    public callType: CallType = "OFFICIAL";
    public restricted = false;
    public restrictedUntil: Date | null = null;
    public activeCalls = 0;

    constructor(public readonly token: string) {}

    receiveOffer(id: string, peer: Peer) {
        const offer = Call.CreateOffer(id, this.callType, peer, this.token);
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
