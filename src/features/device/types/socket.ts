import type { Socket } from "socket.io-client";
import type { CallStatus } from "@/features/call/types/call";
import type { DeviceStatus } from "@/features/device/types/device";
import type { AcceptContent } from "@/features/device/types/whatsapp/accept";
import type { MuteV2Content } from "@/features/device/types/whatsapp/mute_v2";
import type { OfferContent } from "@/features/device/types/whatsapp/offer";
import type { RejectContent } from "@/features/device/types/whatsapp/reject";
import type { TerminateContent } from "@/features/device/types/whatsapp/terminate";
import type { PreacceptContent } from "@/features/device/types/whatsapp/preaccept";
import type { RelayLatencyContent } from "@/features/device/types/whatsapp/relay_latency";

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

export type DeviceResponse<TSuccessResult extends string | object | undefined = undefined> =
    | DeviceResponseSuccess<TSuccessResult>
    | DeviceResponseError;

export type CallType = "official" | "unofficial";

export type CallPeer = {
    phone: string;
    displayName: string | null;
    profilePicture: string | null;
};

export type CallTransport<T extends CallType = CallType> = T extends "official"
    ? {
          type: T;
          sdpOffer: RTCSessionDescriptionInit;
      }
    : {
          type: T;
          server: { host: string; port: string };
      };

export type Stats = {
    rtt: {
        client: {
            min: number;
            max: number;
            avg: number;
        };
        whatsapp: {
            min: number;
            max: number;
            avg: number;
        };
    };
    tx: {
        total: number;
        total_bytes: number;
        loss: number;
    };
    rx: {
        total: number;
        total_bytes: number;
        loss: number;
    };
};

export type DeviceSocketServerToClientEvents = {
    "device:qrcode": (qrcode: string | null) => void;
    "device:status": (device_status: DeviceStatus | null) => void;
    "device:contact": (type: CallType, contact: { phone: string } | null) => void;
    "call:offer": (call: { id: string; peer: CallPeer }) => void;
    "call:signaling": (packet: Signaling, call_id: string) => void;
    "call:error": (call_id: string, error: string) => void;
    "call:status": (call_id: string, status: CallStatus) => void;
    "call:stats": (call_id: string, stats: Stats) => void;
    "peer:accepted_elsewhere": (call_id: string) => void;
    "peer:rejected_elsewhere": (call_id: string) => void;
    "peer:mute": (call_id: string, mute: boolean) => void;
};

export type DeviceSocketClientToServerEvents = {
    "call:start": (
        phone: string,
        callback: (
            response: DeviceResponse<{ id: string; peer: CallPeer; transport: CallTransport<"unofficial"> }>,
        ) => void,
    ) => void;
    "call:sdp-answer": (answer: RTCSessionDescriptionInit) => void;
    "call:accept": (call: { id: string }, callback: (response: DeviceResponse<CallTransport>) => void) => void;
    "call:reject": (callId: string, callback: (response: DeviceResponse) => void) => void;
    "call:mute": (callback: (response: DeviceResponse) => void) => void;
    "call:unmute": (callback: (response: DeviceResponse) => void) => void;
    "call:end": (callback: (response: DeviceResponse) => void) => void;
    "device:qrcode": (callback: (qrcode: string | null) => void) => void;
    "device:status": (callback: (device_status: DeviceStatus | "") => void) => void;
    "whatsapp:pairing_code": (phone: string, callback: (response: DeviceResponse<string>) => void) => void;
};

export type DeviceSocket = Socket<DeviceSocketServerToClientEvents, DeviceSocketClientToServerEvents>;
