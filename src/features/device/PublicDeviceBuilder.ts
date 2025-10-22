import type { DeviceManager } from "@/features/device/device-manager";
import type { Device } from "@/features/device/types/device";

export function PublicDeviceBuilder(device: DeviceManager): Device {
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
        powerOn: () => device.getInfos(),
        restart: () => device.restart(),
        logout: () => device.logout(),
    };
}
