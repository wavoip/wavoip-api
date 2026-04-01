import type { CallType } from "@/modules/device/Call";
import type { Contact, DeviceStatus } from "@/modules/device/Device";
import type { DeviceConnection } from "@/modules/device/DeviceConnection";
import type { Device } from "@/modules/device/DeviceConnection";
import type { Unsubscribe } from "@/modules/shared/EventEmitter";

export function DeviceProxy(conn: DeviceConnection): Device {
    return {
        token: conn.token,
        qrCode: conn.qrCode,
        contact: conn.contact,
        status: conn.status,

        onStatus(cb: (status: DeviceStatus) => void): Unsubscribe {
            return conn.onStatus(cb);
        },

        onQRCode(cb: (qrcode?: string) => void): Unsubscribe {
            return conn.onQRCode(cb);
        },

        onContact(cb: (type: CallType, contact?: Contact) => void): Unsubscribe {
            return conn.onContact(cb);
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
