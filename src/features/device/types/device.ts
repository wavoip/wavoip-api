import type { CallType } from "@/features/device/types/socket";

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
    contact: { official: { phone: string } | null; unnoficial?: { phone: string } | null };
    onStatus(cb: (status: DeviceStatus | null) => void): void;
    onQRCode(cb: (qrcode: string | null) => void): void;
    onContact(cb: (type: CallType, contact: { phone: string } | null) => void): void;
    restart(): void;
    logout(): void;
    wakeUp(): void;
    pairingCode(phone: string): void;
    delete(): void;
};
