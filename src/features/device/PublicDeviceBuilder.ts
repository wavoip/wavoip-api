import type { DeviceManager } from "@/features/device/device-manager";
import type { Device } from "@/features/device/types/device";
import type { Wavoip } from "@/Wavoip";

export function PublicDeviceBuilder(device: DeviceManager, wavoip: Wavoip): Device {
    return {
        token: device.token,
        status: device.status,
        qrcode: device.qrcode,
        contact: device.contact,
        onStatus: (cb) => {
            device.removeAllListeners("status");
            device.on("status", cb);
        },
        onQRCode: (cb) => {
            device.removeAllListeners("qrcode");
            device.on("qrcode", cb);
        },
        onContact: (cb) => {
            device.removeAllListeners("contact");
            device.on("contact", cb);
        },
        wakeUp: () => device.getInfos(),
        restart: () => device.restart(),
        logout: () => device.logout(),
        pairingCode: (...args) => device.requestPairingCode(...args),
        delete: () => wavoip.removeDevices([device.token]),
    };
}
