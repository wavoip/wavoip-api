import type { CallType } from "@/domain/call/types";
import type { DeviceErrorCode } from "@/domain/shared/errors";

/**
 * Account-level device status. WebSocket transport state is tracked separately
 * via `ConnectionStatus` and `connectionStatusChanged`.
 */
export type DeviceStatus =
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

    /** O motivo de o device não poder chamar agora, ou `null` se ele pode. */
    canCall(): DeviceErrorCode | null {
        if (this.status === "error") return "DEVICE_ERROR";
        if (this.status === "connecting") return "DEVICE_NOT_LINKED";
        if (this.status === "restarting") return "DEVICE_RESTARTING";
        return null;
    }
}
