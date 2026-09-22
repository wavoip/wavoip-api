import type { CallStats } from "@/modules/call/Stats";
import { Stats } from "@/domain/call/stats";
import type { Events, ITransport, TransportStatus } from "@/modules/media/ITransport";
import { EventEmitter } from "@/modules/shared/EventEmitter";

/** Transporte de relay sem rede nem áudio; registra quantas vezes foi parado. */
export class FakeTransport extends EventEmitter<Events> implements ITransport {
    readonly kind = "ws" as const;
    status: TransportStatus = "connected";
    peerMuted = false;
    audioAnalyserIn: Promise<AnalyserNode> = Promise.resolve({} as AnalyserNode);
    audioAnalyserOut: Promise<AnalyserNode> = Promise.resolve({} as AnalyserNode);
    stats: CallStats = Stats.empty();
    stopCount = 0;

    async start(): Promise<void> {}

    async stop(): Promise<void> {
        this.stopCount += 1;
    }

    async getStats(): Promise<CallStats> {
        return this.stats;
    }
}
