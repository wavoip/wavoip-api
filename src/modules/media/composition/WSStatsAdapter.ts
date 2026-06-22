import { type CallStats, makeEmptyCallStats } from "@/modules/call/Stats";
import type { IStatsAdapter } from "@/modules/media/composition/StatsAdapter";

// PCMU at 8kHz, 20ms frames = 160 bytes / 20ms. Used by the RFC 3550 jitter
// estimator to compute |arrival_delta - expected| per packet.
const RX_EXPECTED_INTERVAL_MS = 20;

/**
 * Audio-level provider — the adapter samples mic + speaker RMS from the audio
 * pipe each refresh. Kept as a narrow interface so the adapter stays agnostic
 * of the concrete `AudioInput` / `AudioOutput` classes.
 */
export interface AudioLevelProvider {
    readTxLevel(): number;
    readRxLevel(): number;
}

/**
 * WebSocket stats adapter — owns the client-side counters that have no
 * server-side equivalent (bitrate from byte deltas, RFC 3550 jitter from
 * RX arrival cadence, mic/speaker audio levels, AudioContext.outputLatency).
 *
 * Updates flow in two ways:
 *   - Side-effect API: `noteSent(byteLength)` / `noteReceived(byteLength)` are
 *     called by the transport on every outgoing/incoming binary frame. These
 *     keep total counters + RX-jitter accumulator current.
 *   - `refresh()` recomputes derived fields (bitrate window, audio levels,
 *     output latency) from the most recent counters.
 *
 * Server-pushed stats (RTT, loss totals) live on the Call class, not here —
 * `Call.mergeUnofficialStats` overlays this adapter's snapshot onto the server
 * projection.
 */
export class WSStatsAdapter implements IStatsAdapter {
    private cache: CallStats = makeEmptyCallStats();
    private prevRxBytes = 0;
    private prevTxBytes = 0;
    private prevSampleTs = 0;
    private lastRxArrivalTs = 0;

    constructor(
        private readonly audioContext: AudioContext,
        private readonly levels: AudioLevelProvider,
    ) {}

    snapshot(): CallStats {
        return this.cache;
    }

    refresh(): Promise<void> {
        this.sampleStats();
        return Promise.resolve();
    }

    noteSent(byteLength: number): void {
        this.cache.tx.total_bytes += byteLength;
        this.cache.tx.total += 1;
    }

    noteReceived(byteLength: number): void {
        this.cache.rx.total_bytes += byteLength;
        this.cache.rx.total += 1;

        const now = performance.now();
        if (this.lastRxArrivalTs > 0) {
            const arrivalDelta = now - this.lastRxArrivalTs;
            const d = Math.abs(arrivalDelta - RX_EXPECTED_INTERVAL_MS);
            // RFC 3550 jitter estimate: J += (|D| - J) / 16
            this.cache.rx.jitter_ms += (d - this.cache.rx.jitter_ms) / 16;
        }
        this.lastRxArrivalTs = now;
    }

    private sampleStats(): void {
        const now = performance.now();
        const txBytes = this.cache.tx.total_bytes;
        const rxBytes = this.cache.rx.total_bytes;

        if (this.prevSampleTs > 0) {
            const dtSec = (now - this.prevSampleTs) / 1000;
            if (dtSec > 0) {
                this.cache.tx.bitrate_kbps = ((txBytes - this.prevTxBytes) * 8) / dtSec / 1000;
                this.cache.rx.bitrate_kbps = ((rxBytes - this.prevRxBytes) * 8) / dtSec / 1000;
            }
        }
        this.prevTxBytes = txBytes;
        this.prevRxBytes = rxBytes;
        this.prevSampleTs = now;

        this.cache.tx.audio_level = this.levels.readTxLevel();
        this.cache.rx.audio_level = this.levels.readRxLevel();
        this.cache.audio_context.output_latency_ms = this.audioContext.outputLatency * 1000;
    }
}
