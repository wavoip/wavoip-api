import type { Socket } from "socket.io-client";
import type { CallStats } from "@/features/call/types/call";
import type { DeviceStatus } from "@/features/device/types/device";
import type { AcceptContent } from "@/features/device/types/whatsapp/accept";
import type { MuteV2Content } from "@/features/device/types/whatsapp/mute_v2";
import type { OfferContent } from "@/features/device/types/whatsapp/offer";
import type { RejectContent } from "@/features/device/types/whatsapp/reject";
import type { TerminateContent } from "@/features/device/types/whatsapp/terminate";

export type Signaling = OfferContent | AcceptContent | RejectContent | TerminateContent | MuteV2Content;

type DeviceResponseError = {
    type: "error";
    result: string;
    code?: "busy";
};

type DeviceResponseSuccess<TResult = undefined> = {
    type: "success";
    result: TResult extends undefined ? never : TResult;
};

export type DeviceResponse<TSuccessResult extends string | object | undefined = undefined> =
    | DeviceResponseSuccess<TSuccessResult>
    | DeviceResponseError;

export type DeviceSocketServerToClientEvents = {
    "audio_transport:create": (data: { ip: string; port: string }) => void;
    "audio_transport:terminate": () => void;
    qrcode: (qrcode: string) => void;
    device_status: (device_status: DeviceStatus | null) => void;
    signaling: (packet: Signaling, call_id: string) => void;
    "peer:accepted_elsewhere": (call_id: string) => void;
    "peer:rejected_elsewhere": (call_id: string) => void;
    "calls:error": (call_id: string, error: string) => void;
    stats: (call_id: string, stats: CallStats) => void;
};

export type DeviceSocketClientToServerEvents = {
    "calls:start": (whatsapp_id: string, callback: (response: DeviceResponse<{ call_id: string }>) => void) => void;
    "calls:reject": (call_id: string, callback: (response: DeviceResponse) => void) => void;
    "calls:mute": (callback: (response: DeviceResponse) => void) => void;
    "calls:unmute": (callback: (response: DeviceResponse) => void) => void;
    "calls:end": (callback: (response: DeviceResponse) => void) => void;
    "calls:accept": (call_id: string, callback: (response: DeviceResponse) => void) => void;
    "whatsapp:qrcode": (callback: (qrcode: string) => void) => void;
    "whatsapp:device_status": (callback: (device_status: DeviceStatus) => void) => void;
    "whatsapp:pairing_code": (phone: string, callback: (response: DeviceResponse<string>) => void) => void;
};

export type DeviceSocket = Socket<DeviceSocketServerToClientEvents, DeviceSocketClientToServerEvents>;
