import type { Contact, DeviceStatus } from "@/modules/device/Device";
import type { DeviceConnection, DeviceEvents } from "@/modules/device/DeviceConnection";
import type { Device } from "@/modules/device/DeviceConnection";
import type { Unsubscribe } from "@/modules/shared/EventEmitter";
import { warnDeprecated } from "@/modules/shared/deprecation";

export function DeviceProxy(conn: DeviceConnection): Device {
    return {
        token: conn.token,
        qrCode: conn.qrCode,
        contact: conn.contact,
        status: conn.status,
        connectionStatus: conn.connectionStatus,
        restricted: conn.restricted,
        restrictedUntil: conn.restrictedUntil,

        on<T extends keyof DeviceEvents>(event: T, callback: (...args: DeviceEvents[T]) => void): Unsubscribe {
            return conn.on(event, callback);
        },

        onStatus(cb: (status: DeviceStatus) => void): Unsubscribe {
            warnDeprecated("Device.onStatus", 'use `device.on("statusChanged", cb)` instead.');
            return conn.on("statusChanged", cb);
        },

        onQRCode(cb: (qrcode?: string) => void): Unsubscribe {
            warnDeprecated("Device.onQRCode", 'use `device.on("qrCodeChanged", cb)` instead.');
            return conn.on("qrCodeChanged", cb);
        },

        onContact(cb: (contact?: Contact) => void): Unsubscribe {
            warnDeprecated("Device.onContact", 'use `device.on("contactChanged", cb)` instead.');
            return conn.on("contactChanged", cb);
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
