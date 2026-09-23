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

        restart(): Promise<void> {
            return conn.restart();
        },

        logout(): Promise<void> {
            return conn.logout();
        },

        wakeUp(): Promise<boolean> {
            return conn.wakeUp();
        },

        pairingCode(phone: string): Promise<{ pairingCode: string; err: null } | { pairingCode: null; err: string }> {
            return conn.pairingCode(phone);
        },
    };
}
