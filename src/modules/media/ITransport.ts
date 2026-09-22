import type { CallStats } from "@/modules/call/Stats";
import type { TransportStatus } from "@/domain/call/types";
import type { ConnectivityIssue, IceConfig, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import type { EventEmitter } from "@/modules/shared/EventEmitter";

export type { TransportStatus } from "@/domain/call/types";
export type TransportKind = "webrtc" | "ws";

export const DEFAULT_STATS_TICK_MS = 200;

/**
 * `iceConfig` só vale para o WebRTC; o transporte WS o ignora.
 */
export type TransportOptions = {
    iceConfig?: IceConfig;
    statsTickMs?: number;
};

export type Events = {
    statusChanged: [status: TransportStatus];
    statsChanged: [stats: CallStats];
    peerMuted: [muted: boolean];
    iceDiagnostics: [diag: IceDiagnostics];
    connectivityIssue: [issue: ConnectivityIssue];
};

export interface ITransport extends EventEmitter<Events> {
    readonly kind: TransportKind;
    status: TransportStatus;
    peerMuted: boolean;
    audioAnalyserIn: Promise<AnalyserNode>;
    audioAnalyserOut: Promise<AnalyserNode>;
    stats: CallStats;

    start(): Promise<void>;
    stop(): Promise<void>;

    getStats(): Promise<CallStats>;
}

export interface IRTCTransport extends ITransport {
    readonly kind: "webrtc";
    readonly answer: Promise<RTCSessionDescriptionInit>;
    lastDiagnostics: IceDiagnostics | null;
    emittedConnectivityIssues: ReadonlySet<ConnectivityIssue>;
    createOffer(): Promise<string>;
    setAnswer(sdp: string): Promise<void>;
}

export function isRTCTransport(t: ITransport): t is IRTCTransport {
    return t.kind === "webrtc";
}
