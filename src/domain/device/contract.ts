import type { ConnectionStatus, Contact, DeviceStatus } from "@/modules/device/Device";
import type { CommandFailure, DeviceApiFailure } from "@/domain/shared/errors";
import type { Result } from "@/domain/shared/Result";
import type { Unsubscribe } from "@/modules/shared/EventEmitter";

export type DeviceEvents = {
    statusChanged: [status: DeviceStatus];
    connectionStatusChanged: [status: ConnectionStatus];
    qrCodeChanged: [qrCode?: string];
    contactChanged: [contact?: Contact];
    restrictedChanged: [restricted: boolean, restrictedUntil: Date | null];
    activeCallsChanged: [count: number];
};

/** A Wavoip device: what the server says about it, and what can be asked of it. */
export interface Device {
    readonly token: string;
    /** Always current: read it whenever you draw, including inside a handler. */
    readonly qrCode?: string;
    readonly contact?: Contact;
    readonly status: DeviceStatus;
    readonly connectionStatus: ConnectionStatus;
    readonly restricted: boolean;
    readonly restrictedUntil: Date | null;
    readonly activeCalls: number;
    on<T extends keyof DeviceEvents>(event: T, callback: (...args: DeviceEvents[T]) => void): Unsubscribe;
    restart(): Promise<Result<void, DeviceApiFailure>>;
    logout(): Promise<Result<void, DeviceApiFailure>>;
    wakeUp(): Promise<Result<void, DeviceApiFailure>>;
    pairingCode(phone: string): Promise<Result<string, CommandFailure>>;
}
