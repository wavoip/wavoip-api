import type { CallPeer } from "@/modules/call/Peer";
import type { ServerCallStats } from "@/modules/call/Stats";
import type { CallType } from "@/modules/device/Call";
import type { CallFailReason } from "@/modules/device/CallFailReason";
import type { Contact, DeviceStatus } from "@/modules/device/Device";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";

export function DeviceWebSocketFactory(token: string, platform?: string): DeviceSocket {
    const websocket = io("https://devices.wavoip.com", {
        transports: ["websocket"],
        path: `/${token}/websocket`,
        autoConnect: false,
        auth: { version: "official", platform: platform },
    }) as DeviceSocket;

    return websocket;
}

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

export type MediaPlanRelay = { type: "relay"; host: string; port: string };
export type MediaPlanWebRTC = { type: "webRTC"; sdp: string };
export type MediaPlanNull = { type: "none" };
export type MediaPlan = MediaPlanRelay | MediaPlanWebRTC | MediaPlanNull;

export type ServerEvents = {
    "device:init": (
        status: DeviceStatus,
        callType: CallType,
        contact: Contact | null,
        qrCode: string | null,
        restricted: boolean,
        // Optional: older instance versions omit this arg. Treat undefined as null.
        restrictedUntil?: string | null,
        // Optional: older instance versions omit this arg. Treat undefined as 0.
        activeCalls?: number,
    ) => void;
    "device:building": () => void;
    "device:open": (contact: Contact) => void;
    "device:connecting": (qrcode: string | null) => void;
    "device:close": () => void;
    "device:restarting": () => void;
    "device:hibernating": () => void;
    // Optional restrictedUntil: older instance versions omit this arg. Treat undefined as null.
    "device:restriction:changed": (restricted: boolean, restrictedUntil?: string | null) => void;
    "device:calls": (count: number) => void;

    "call:offer": (call: { id: string; peer: CallPeer; offer: MediaPlan }, ackOffer: () => void) => void;
    "call:ringing": (callId: string) => void;
    "call:answered": (callId: string, mediaPlan: MediaPlan) => void;
    "call:accepted": (callId: string) => void;
    "call:rejected": (callId: string) => void;
    "call:ended": (callId: string) => void;
    "call:unanswered": (callId: string) => void;
    "call:failed": (callId: string, error: CallFailReason) => void;
    "call:stats": (callId: string, stats: ServerCallStats) => void;
    "call:peer:muted": (callId: string, muted: boolean) => void;
};

export type ClientEvents = {
    "device.pairing_code": (phone: string, callback: (response: WssResponse<string>) => void) => void;

    "call.start": (
        phone: string,
        offer: MediaPlan,
        callback: (response: WssResponse<{ id: string; peer: CallPeer }>) => void,
    ) => void;
    "call.cancel": (callId: string, callback: (response: WssResponse) => void) => void;
    "call.accept": (callId: string, answer: MediaPlan, callback: (response: WssResponse) => void) => void;
    "call.reject": (callId: string, callback: (response: WssResponse) => void) => void;
    "call.end": (callId: string, callback: (response: WssResponse) => void) => void;
    "call.mute": (callId: string, mute: boolean, callback: (response: WssResponse) => void) => void;
};

export type ServerEventHandler<E extends keyof ServerEvents> = (...args: Parameters<ServerEvents[E]>) => void;

export type DeviceSocket = Socket<ServerEvents, ClientEvents>;
