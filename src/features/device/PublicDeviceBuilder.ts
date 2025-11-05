import type { DeviceManager } from "@/features/device/device-manager";
import type { Device } from "@/features/device/types/device";
import type { Wavoip } from "@/Wavoip";

export function PublicDeviceBuilder(device: DeviceManager, wavoip: Wavoip): Device {
    return {
        token: device.token,
        status: device.status,
        qrcode: device.qrcode,
        onStatus: (cb) => {
            device.removeAllListeners("status");
            device.on("status", cb);
        },
        onQRCode: (cb) => {
            device.removeAllListeners("qrcode");
            device.on("qrcode", cb);
        },
        wakeUp: () => device.getInfos(),
        restart: () => device.restart(),
        logout: () => device.logout(),
        pairingCode: (phone: string) => device.requestPairingCode(phone),
        delete: () => wavoip.removeDevices([device.token]),
    };
}
