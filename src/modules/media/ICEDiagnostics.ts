export type IceCandidateKind = "host" | "srflx" | "prflx" | "relay";

export type IceDiagnostics = {
    gatheringDurationMs: number;
    gatheringTimedOut: boolean;
    candidatesByType: Record<IceCandidateKind, number>;
    stunReached: boolean;
    turnReached: boolean;
    selectedCandidatePair?: {
        local: IceCandidateKind;
        remote: IceCandidateKind;
        rtt?: number;
    };
};

export type ConnectivityIssue =
    | "STUN_UNREACHABLE"
    | "ICE_GATHERING_TIMEOUT"
    | "ICE_CONNECTION_FAILED"
    | "NO_HOST_CANDIDATES"
    | "SYMMETRIC_NAT_SUSPECTED";

export type IceConfig = {
    gatheringTimeoutMs?: number;
    iceServers?: RTCIceServer[];
};

export const DEFAULT_ICE_GATHERING_TIMEOUT_MS = 2500;

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
    {
        urls: [
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302",
            "stun:stun.cloudflare.com:3478",
        ],
    },
];
