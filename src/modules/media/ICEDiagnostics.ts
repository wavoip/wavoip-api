export type { ConnectivityIssue, IceCandidateKind, IceDiagnostics } from "@/domain/call/ice";

export type IceConfig = {
    gatheringTimeoutMs?: number;
    iceServers?: RTCIceServer[];
};

export const DEFAULT_ICE_GATHERING_TIMEOUT_MS = 2500;

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
    {
        urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun.cloudflare.com:3478"],
    },
];
