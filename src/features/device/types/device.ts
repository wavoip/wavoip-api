export type DeviceStatus =
    | "disconnected"
    | "close"
    | "connecting"
    | "open"
    | "error"
    | "restarting"
    | "hibernating"
    | "BUILDING"
    | "WAITING_PAYMENT"
    | "EXTERNAL_INTEGRATION_ERROR";

export type Device = {
    token: string;
    status: DeviceStatus | null;
    qrcode: string | null;
    onStatus(cb: (status: DeviceStatus | null) => void): void;
    onQRCode(cb: (qrcode: string | null) => void): void;
    restart(): void;
    logout(): void;
    powerOn(): void;
    pairingCode(phone: string): void;
};
