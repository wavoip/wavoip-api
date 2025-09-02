import type { DeviceStatus } from "@/features/device/types/device";

export type DeviceCallbacks = {
    onStatus?: (status: DeviceStatus | null) => void;
    onQRCode?: (qrcode: string) => void;
};
