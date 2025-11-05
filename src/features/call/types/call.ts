import type { CallPeer } from "@/features/device/types/socket";
import type { TransportStatus } from "@/features/multimedia/transport/ITransport";

export type CallDirection = "INCOMING" | "OUTGOING";

export type CallStatus =
    | "RINGING"
    | "CALLING"
    | "NOT ANSWERED"
    | "ACTIVE"
    | "ENDED"
    | "REJECTED"
    | "FAILED"
    | "DISCONNECTED"
    | "DEVICE_RESTARTING";

export type CallStats = {
    rtt: {
        min: number;
        max: number;
        avg: number;
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

export type Call = {
    id: string;
    device_token: string;
    direction: CallDirection;
    status: CallStatus;
    peer: CallPeer & { muted: boolean };
    muted: boolean;
    callbacks: CallCallbacks;
};

export type CallOffer = Omit<Call, "callbacks"> & {
    accept(): Promise<{ call: CallActive; err: null } | { call: null; err: string }>;
    reject(): Promise<{ err: string | null }>;
    onAcceptedElsewhere(callback: () => void): void;
    onRejectedElsewhere(callback: () => void): void;
    onUnanswered(cb: () => void): void;
    onEnd(cb: () => void): void;
    onStatus(cb: (status: CallStatus) => void): void;
};

export type CallOfferOfficial = Omit<Call, "callbacks"> & {
    accept(answer: RTCSessionDescriptionInit): Promise<{ call: CallActive; err: null } | { call: null; err: string }>;
    reject(): Promise<{ err: string | null }>;
    onAcceptedElsewhere(callback: () => void): void;
    onRejectedElsewhere(callback: () => void): void;
    onUnanswered(cb: () => void): void;
    onEnd(cb: () => void): void;
    onStatus(cb: (status: CallStatus) => void): void;
};

export type CallActive = Omit<Call, "callbacks"> & {
    connection_status: TransportStatus;
    audio_analyser: Promise<AnalyserNode>;
    mute(): Promise<{ err: string | null }>;
    unmute(): Promise<{ err: string | null }>;
    end(): Promise<{ err: string | null }>;
    onError(callback: (err: string) => void): void;
    onPeerMute(callback: () => void): void;
    onPeerUnmute(callback: () => void): void;
    onEnd(callback: () => void): void;
    onStats(callback: (stats: CallStats) => void): void;
    onConnectionStatus(callback: (status: TransportStatus) => void): void;
    onStatus(cb: (status: CallStatus) => void): void;
};

export type CallOutgoing = Omit<Call, "callbacks"> & {
    onPeerAccept(callback: (call: CallActive) => void): void;
    onPeerReject(callback: () => void): void;
    onUnanswered(callback: () => void): void;
    onEnd(callback: () => void): void;
    mute(): Promise<{ err: string | null }>;
    unmute(): Promise<{ err: string | null }>;
    end(): Promise<{ err: string | null }>;
    onStatus(cb: (status: CallStatus) => void): void;
};

export type CallCallbacks = {
    onAccept?: () => void;
    onReject?: () => void;
    onEnd?: () => void;
    onUnanswered?: () => void;
    onAcceptedElsewhere?: () => void;
    onRejectedElsewhere?: () => void;
    onPeerMute?: () => void;
    onPeerUnmute?: () => void;
    onError?: (err: string) => void;
    onStats?: (stats: CallStats) => void;
    onStatus?: (status: CallStatus) => void;
};
