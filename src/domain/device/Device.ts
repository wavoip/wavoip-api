import type { CallType } from "@/domain/call/types";
import type { CommandFailure, DeviceApiFailure } from "@/domain/shared/errors";
import type { Result } from "@/domain/shared/Result";
import type { Unsubscribe } from "@/modules/shared/EventEmitter";

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

export type DeviceEvents = {
    statusChanged: [status: DeviceStatus];
    connectionStatusChanged: [status: ConnectionStatus];
    qrCodeChanged: [qrCode: string | null];
    contactChanged: [contact: Contact | null];
    /** `null` means the account is free again. */
    restrictionChanged: [restriction: DeviceRestriction | null];
    activeCallsChanged: [count: number];
};

/** A Wavoip device: what the server says about it, and what can be asked of it. */
export interface Device {
    readonly token: string;
    /** Always current: read it whenever you draw, including inside a handler. */
    readonly status: DeviceStatus;
    readonly connectionStatus: ConnectionStatus;
    /** The code to be scanned while `status` is `"connecting"`. */
    readonly qrCode: string | null;
    readonly contact: Contact | null;
    /** Present while WhatsApp is holding the account back. */
    readonly restriction: DeviceRestriction | null;
    readonly activeCalls: number;
    on<T extends keyof DeviceEvents>(event: T, callback: (...args: DeviceEvents[T]) => void): Unsubscribe;
    restart(): Promise<Result<void, DeviceApiFailure>>;
    logout(): Promise<Result<void, DeviceApiFailure>>;
    wakeUp(): Promise<Result<void, DeviceApiFailure>>;
    pairingCode(phone: string): Promise<Result<string, CommandFailure>>;
}
