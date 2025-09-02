export type DeviceStatus =
    | "CONNECTED"
    | "DISCONNECTED"
    | "BUILDING"
    | "open"
    | "close"
    | "connecting"
    | "no_status"
    | "error"
    | "restarting"
    | "hibernating"
    | "WAITING_PAYMENT"
    | "EXTERNAL_INTEGRATION_ERROR";

export type Device = {
    token: string;
    status: DeviceStatus | null;
    qrcode: string | null;
    onStatus(cb: (status: DeviceStatus | null) => void): void;
    onQRCode(cb: (qrcode: string) => void): void;
};
