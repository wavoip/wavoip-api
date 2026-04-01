import type { CallPeer } from "@/modules/call/Peer";
import type { CallStats } from "@/modules/call/Stats";
import type { CallStatus } from "@/modules/device/Call";
import type { CallType } from "@/modules/device/Call";
import type { DeviceStatus } from "@/modules/device/Device";
import type { AcceptContent } from "@/modules/device/types/whatsapp/accept";
import type { MuteV2Content } from "@/modules/device/types/whatsapp/mute_v2";
import type { OfferContent } from "@/modules/device/types/whatsapp/offer";
import type { PreacceptContent } from "@/modules/device/types/whatsapp/preaccept";
import type { RejectContent } from "@/modules/device/types/whatsapp/reject";
import type { RelayLatencyContent } from "@/modules/device/types/whatsapp/relay_latency";
import type { TerminateContent } from "@/modules/device/types/whatsapp/terminate";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";

export function DeviceWebSocketFactory(token: string, platform?: string) {
    return io("https://devices.wavoip.com", {
        transports: ["websocket"],
        path: `/${token}/websocket`,
        autoConnect: false,
        auth: { version: "official", platform: platform },
    }) as DeviceSocket;
}

export type Signaling =
    | OfferContent
    | PreacceptContent
    | AcceptContent
    | RejectContent
    | RelayLatencyContent
    | TerminateContent
    | MuteV2Content;

type DeviceResponseError = {
    type: "error";
    result: string;
    code?: "busy";
};

type DeviceResponseSuccess<TResult> = TResult extends undefined
    ? { type: "success" }
    : { type: "success"; result: TResult };

export type WssResponse<TSuccessResult extends string | object | undefined = undefined> =
    | DeviceResponseSuccess<TSuccessResult>
    | DeviceResponseError;

export type WssCallback<TSuccessResult extends string | object | undefined = undefined> = (
    response: WssResponse<TSuccessResult>,
) => void;

export type Stats = {
    rtt: {
        client: { min: number; max: number; avg: number };
        whatsapp: { min: number; max: number; avg: number };
    };
    tx: { total: number; total_bytes: number; loss: number };
    rx: { total: number; total_bytes: number; loss: number };
};

export type ServerEvents = {
    "device:qrcode": (qrcode: string | null) => void;
    "device:status": (device_status: DeviceStatus) => void;
    "device:contact": (type: CallType, contact: { phone: string } | null) => void;

    "call:offer": (
        call: { id: string; peer: CallPeer; server: { host: string; port: string } },
        res: (response: { action: "accept" | "reject" }) => void,
    ) => void;
    "call:offer:official": (
        call: { id: string; peer: CallPeer; offer: string },
        res: (response: { action: "accept"; answer: string } | { action: "reject" }) => void,
    ) => void;
    "call:calling": (call_id: string) => void;
    "call:accepted": (call_id: string) => void;
    "call:rejected": (call_id: string) => void;
    "call:ended": (call_id: string) => void;
    "call:failed": (call_id: string, error: string) => void;
    "call:status": (call_id: string, status: CallStatus) => void;
    "call:stats": (call_id: string, stats: CallStats) => void;
    "call:peer:muted": (call_id: string, muted: boolean) => void;
};

export type ClientEvents = {
    "call.start": (
        phone: string,
        callback: (
            response: WssResponse<{ id: string; peer: CallPeer; transport: { host: string; port: string } }>,
        ) => void,
    ) => void;
    "call.end": (call_id: string, callback: (response: WssResponse) => void) => void;
    "device.pairing_code": (phone: string, callback: (response: WssResponse<string>) => void) => void;
    "call.mute": (call_id: string, mute: boolean, callback: (response: WssResponse) => void) => void;
};

export type ServerEventHandler<E extends keyof ServerEvents> = (...args: Parameters<ServerEvents[E]>) => void;

export type DeviceSocket = Socket<ServerEvents, ClientEvents>;
