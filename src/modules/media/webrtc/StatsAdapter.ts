import type { CallStats } from "@/domain/call/stats";
import { Stats } from "@/domain/call/stats";
import type { IStatsAdapter } from "@/modules/media/ITransport";
import type { PeerConnectionLike, StatEntry } from "@/ports/runtime/PeerConnectionPort";

/**
 * Tudo medido no peer local, sem nada do servidor. A latência de saída vem do
 * `AudioContext.outputLatency` porque o `pc.getStats` não a expõe.
 */
export class RTCStatsAdapter implements IStatsAdapter {
    private cache: CallStats = Stats.empty();
    private prevBytesReceived = 0;
    private prevBytesSent = 0;
    private prevSampleTs = 0;

    constructor(
        private readonly pc: PeerConnectionLike,
        private readonly audioContext: AudioContext,
    ) {}

    snapshot(): CallStats {
        return this.cache;
    }

    async refresh(): Promise<void> {
        const report = await this.pc.getStats();
        let curBytesReceived = 0;
        let curBytesSent = 0;

        for (const stat of report.values()) {
            if (isAudioInbound(stat)) curBytesReceived = this.absorbInbound(stat);
            else if (isAudioOutbound(stat)) curBytesSent = this.absorbOutbound(stat);
            else if (isAudioMediaSource(stat)) this.absorbMediaSource(stat);
            else if (isAudioRemoteInbound(stat)) this.absorbRemoteInbound(stat);
        }

        this.updateBitrateSample(curBytesReceived, curBytesSent);
        this.cache.audio_context.output_latency_ms = this.audioContext.outputLatency * 1000;
    }

    private absorbInbound(stat: AudioInboundStat): number {
        if (stat.bytesReceived) this.cache.rx.total_bytes += stat.bytesReceived;
        if (stat.packetsLost) this.cache.rx.loss = stat.packetsLost;
        if (stat.packetsReceived) this.cache.rx.total = stat.packetsReceived;
        if (typeof stat.audioLevel === "number") this.cache.rx.audio_level = stat.audioLevel;
        if (typeof stat.jitter === "number") this.cache.rx.jitter_ms = stat.jitter * 1000;
        return stat.bytesReceived ?? 0;
    }

    private absorbOutbound(stat: AudioOutboundStat): number {
        if (stat.bytesSent) this.cache.tx.total_bytes += stat.bytesSent;
        return stat.bytesSent ?? 0;
    }

    private absorbMediaSource(stat: AudioMediaSourceStat): void {
        if (typeof stat.audioLevel === "number") this.cache.tx.audio_level = stat.audioLevel;
    }

    private absorbRemoteInbound(stat: RemoteInboundAudioStat): void {
        if (stat.packetsLost) this.cache.tx.loss = stat.packetsLost;
        if (stat.packetsReceived) this.cache.tx.total = stat.packetsReceived;
        if (!stat.roundTripTime || !stat.roundTripTimeMeasurements) return;
        this.foldRtt(stat.roundTripTime, stat.roundTripTimeMeasurements);
    }

    private foldRtt(rtt: number, measurements: number): void {
        this.cache.rtt.avg += (rtt - this.cache.rtt.avg) / measurements;
        if (this.cache.rtt.min === 0 || this.cache.rtt.min > rtt) this.cache.rtt.min = rtt;
        if (this.cache.rtt.max < rtt) this.cache.rtt.max = rtt;
    }

    private updateBitrateSample(curBytesReceived: number, curBytesSent: number): void {
        const now = performance.now();
        if (this.prevSampleTs > 0) {
            const dtSec = (now - this.prevSampleTs) / 1000;
            if (dtSec > 0) {
                this.cache.rx.bitrate_kbps = ((curBytesReceived - this.prevBytesReceived) * 8) / dtSec / 1000;
                this.cache.tx.bitrate_kbps = ((curBytesSent - this.prevBytesSent) * 8) / dtSec / 1000;
            }
        }
        this.prevBytesReceived = curBytesReceived;
        this.prevBytesSent = curBytesSent;
        this.prevSampleTs = now;
    }
}

/** O que cada linha do `getStats` traz, do jeito que a porta a entrega. */
type AudioInboundStat = StatEntry & {
    bytesReceived?: number;
    packetsLost?: number;
    packetsReceived?: number;
    audioLevel?: number;
    jitter?: number;
};

type AudioOutboundStat = StatEntry & { bytesSent?: number };

type AudioMediaSourceStat = StatEntry & { audioLevel?: number };

type RemoteInboundAudioStat = StatEntry & {
    kind: "audio";
    packetsLost?: number;
    packetsReceived?: number;
    roundTripTime?: number;
    roundTripTimeMeasurements?: number;
};

function isAudioInbound(s: StatEntry): s is AudioInboundStat {
    return s.type === "inbound-rtp" && s.kind === "audio";
}

function isAudioOutbound(s: StatEntry): s is AudioOutboundStat {
    return s.type === "outbound-rtp" && s.kind === "audio";
}

function isAudioMediaSource(s: StatEntry): s is AudioMediaSourceStat {
    return s.type === "media-source" && s.kind === "audio";
}

function isAudioRemoteInbound(s: StatEntry): s is RemoteInboundAudioStat {
    return s.type === "remote-inbound-rtp" && s.kind === "audio";
}
