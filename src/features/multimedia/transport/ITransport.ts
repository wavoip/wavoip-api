import type { EventEmitter } from "@/features/EventEmitter";
import type { CallStats } from "@/features/call/types/call";

export type TransportStatus = "disconnected" | "connected" | "connecting";

type Events = {
    status: [status: TransportStatus];
    stats: [stats: CallStats];
};

export interface ITransport extends EventEmitter<Events & (Record<string, []> | never)> {
    status: TransportStatus;
    audioAnalyser: Promise<AnalyserNode>;
    stop(): Promise<void>;
}
