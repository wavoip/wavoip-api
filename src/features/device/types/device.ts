import type { CallType } from "@/features/call/types/call";
import type { DeviceManager } from "../device-manager";
import type { DeviceAllInfo } from "./device-all-info";

export type DeviceStatus =
    | "UP"
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
    contact: DeviceManager["contact"];
    onStatus(cb: (status: DeviceStatus | null) => void): void;
    onQRCode(cb: (qrcode: string | null) => void): void;
    onContact(cb: (type: CallType, contact: { phone: string } | null) => void): void;
    restart(): Promise<string | null>;
    logout(): Promise<string | null>;
    wakeUp(): Promise<DeviceAllInfo | null>;
    pairingCode(phone: string): Promise<{ pairingCode: string; err: null } | { pairingCode: null; err: string }>;
    delete(): void;
};
