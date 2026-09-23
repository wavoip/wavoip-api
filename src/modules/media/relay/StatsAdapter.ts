import type { CallStats } from "@/domain/call/stats";
import { Stats } from "@/domain/call/stats";
import type { IStatsAdapter, RelayMeasurements } from "@/modules/media/ITransport";
import type { AudioEnginePort } from "@/ports/runtime/AudioEnginePort";

// Cadência esperada de chegada dos frames do relay, para o estimador de jitter da
// RFC 3550.
const RX_EXPECTED_INTERVAL_MS = 20;

/**
 * Só o que o servidor não tem como medir. RTT e perda vêm do `call:stats` e se juntam a
 * isto no `Stats.mergeUnofficial`.
 */
export class WSStatsAdapter implements IStatsAdapter {
    private cache: CallStats = Stats.empty();
    private prevRxBytes = 0;
    private prevTxBytes = 0;
    private prevSampleTs = 0;
    private lastRxArrivalTs = 0;

    constructor(
        private readonly engine: AudioEnginePort,
        private readonly relay: RelayMeasurements,
    ) {}

    snapshot(): CallStats {
        return this.cache;
    }

    refresh(): Promise<void> {
        this.sampleStats();
        return Promise.resolve();
    }

    noteSent(byteLength: number): void {
        this.cache.packets.tx.bytes += byteLength;
        this.cache.packets.tx.sent += 1;
    }

    noteReceived(byteLength: number): void {
        this.cache.packets.rx.bytes += byteLength;
        this.cache.packets.rx.received += 1;

        const now = performance.now();
        if (this.lastRxArrivalTs > 0) {
            const arrivalDelta = now - this.lastRxArrivalTs;
            const d = Math.abs(arrivalDelta - RX_EXPECTED_INTERVAL_MS);
            // RFC 3550: J += (|D| - J) / 16
            this.cache.audio.rx.jitter_ms += (d - this.cache.audio.rx.jitter_ms) / 16;
        }
        this.lastRxArrivalTs = now;
    }

    private sampleStats(): void {
        const now = performance.now();
        const txBytes = this.cache.packets.tx.bytes;
        const rxBytes = this.cache.packets.rx.bytes;

        if (this.prevSampleTs > 0) {
            const dtSec = (now - this.prevSampleTs) / 1000;
            if (dtSec > 0) {
                this.cache.audio.tx.bitrate_kbps = ((txBytes - this.prevTxBytes) * 8) / dtSec / 1000;
                this.cache.audio.rx.bitrate_kbps = ((rxBytes - this.prevRxBytes) * 8) / dtSec / 1000;
            }
        }
        this.prevTxBytes = txBytes;
        this.prevRxBytes = rxBytes;
        this.prevSampleTs = now;

        this.cache.audio.tx.level = this.relay.readTxLevel();
        this.cache.audio.rx.level = this.relay.readRxLevel();
        this.cache.latency.jitter_buffer_ms = this.relay.readBufferedMs();
        this.cache.latency.playout_ms = playoutOf(this.engine);
        this.cache.latency.total_ms = Stats.totalOf(this.cache.latency);
    }
}

function playoutOf(engine: AudioEnginePort): number | null {
    return engine.outputLatency === null ? null : engine.outputLatency * 1000;
}
