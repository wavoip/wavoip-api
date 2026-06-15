import type { CallStats } from "@/modules/call/Stats";
import type { ConnectivityIssue, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import type { EventEmitter } from "@/modules/shared/EventEmitter";

export type TransportStatus = "disconnected" | "connected" | "connecting" | "reconnecting";

export type Events = {
    statusChanged: [status: TransportStatus];
    statsChanged: [stats: CallStats];
    peerMuted: [muted: boolean];
    iceDiagnostics: [diag: IceDiagnostics];
    connectivityIssue: [issue: ConnectivityIssue];
};

export interface ITransport extends EventEmitter<Events> {
    status: TransportStatus;
    peerMuted: boolean;
    audioAnalyser: Promise<AnalyserNode>;
    stats: CallStats;

    /** Last `iceDiagnostics` payload emitted, if any. Used by Call.wireTransport to replay. */
    lastDiagnostics?: IceDiagnostics | null;
    /** Set of `connectivityIssue`s already fired. Used by Call.wireTransport to replay. */
    emittedConnectivityIssues?: ReadonlySet<ConnectivityIssue>;

    start(): Promise<void>;
    stop(): Promise<void>;
}
