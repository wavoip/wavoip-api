import type { CommandFailure, DeviceApiFailure } from "@/domain/shared/errors";
import type { Result } from "@/domain/shared/Result";
import type { Device, DeviceConnection, DeviceEvents } from "@/modules/device/DeviceConnection";
import type { Unsubscribe } from "@/modules/shared/EventEmitter";

export function DeviceProxy(conn: DeviceConnection): Device {
    return {
        token: conn.token,
        qrCode: conn.qrCode,
        contact: conn.contact,
        status: conn.status,
        connectionStatus: conn.connectionStatus,
        restricted: conn.restricted,
        restrictedUntil: conn.restrictedUntil,
        activeCalls: conn.activeCalls,

        on<T extends keyof DeviceEvents>(event: T, callback: (...args: DeviceEvents[T]) => void): Unsubscribe {
            return conn.on(event, callback);
        },

        restart(): Promise<Result<void, DeviceApiFailure>> {
            return conn.restart();
        },

        logout(): Promise<Result<void, DeviceApiFailure>> {
            return conn.logout();
        },

        wakeUp(): Promise<Result<void, DeviceApiFailure>> {
            return conn.wakeUp();
        },

        pairingCode(phone: string): Promise<Result<string, CommandFailure>> {
            return conn.pairingCode(phone);
        },
    };
}
