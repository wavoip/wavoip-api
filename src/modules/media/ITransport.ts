import type { CallStats } from "@/modules/call/Stats";
import type { EventEmitter } from "@/modules/shared/EventEmitter";

export type TransportStatus = "disconnected" | "connected" | "connecting" | "reconnecting";

export type Events = {
    statusChanged: [status: TransportStatus];
    statsChanged: [stats: CallStats];
    peerMuted: [muted: boolean];
};

export interface ITransport extends EventEmitter<Events> {
    status: TransportStatus;
    peerMuted: boolean;
    audioAnalyser: Promise<AnalyserNode>;
    stats: CallStats;

    start(): Promise<void>;
    stop(): Promise<void>;
}
