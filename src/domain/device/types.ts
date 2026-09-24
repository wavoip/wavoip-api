import type { CallType } from "@/domain/call/types";

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

/** WhatsApp is holding the account back. `until` is absent when the server does not say. */
export type DeviceRestriction = { readonly until: Date | null };

/** Everything a device announces about itself at once. */
export type DeviceDescription = {
    readonly status: DeviceStatus;
    readonly callType: CallType;
    readonly contact: Contact | null;
    readonly qrCode: string | null;
    readonly restriction: DeviceRestriction | null;
    readonly activeCalls: number;
};
