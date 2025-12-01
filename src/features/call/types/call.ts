import type { TransportStatus } from "@/features/multimedia/transport/ITransport";

export type CallDirection = "INCOMING" | "OUTGOING";

export type CallStatus =
    | "RINGING"
    | "CALLING"
    | "NOT_ANSWERED"
    | "ACTIVE"
    | "ENDED"
    | "REJECTED"
    | "FAILED"
    | "DISCONNECTED"
    | "DEVICE_RESTARTING";

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

export type CallProps = {
    id: string;
    type: CallType;
    device_token: string;
    direction: CallDirection;
    status: CallStatus;
    peer: CallPeer & { muted: boolean };
    muted: boolean;
};

type CallCallbacks = {
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

export type Call = CallProps & {
    callbacks: CallCallbacks;
};

export type CallOffer = CallProps & {
    accept(): Promise<{ call: CallActive; err: null } | { call: null; err: string }>;
    reject(): Promise<{ err: string | null }>;
    onAcceptedElsewhere(callback: () => void): void;
    onRejectedElsewhere(callback: () => void): void;
    onUnanswered(cb: () => void): void;
    onEnd(cb: () => void): void;
    onStatus(cb: (status: CallStatus) => void): void;
};

export type CallActive = CallProps & {
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

export type CallOutgoing = CallProps & {
    onPeerAccept(callback: (call: CallActive) => void): void;
    onPeerReject(callback: () => void): void;
    onUnanswered(callback: () => void): void;
    onEnd(callback: () => void): void;
    mute(): Promise<{ err: string | null }>;
    unmute(): Promise<{ err: string | null }>;
    end(): Promise<{ err: string | null }>;
    onStatus(cb: (status: CallStatus) => void): void;
};
