import type { CallStats } from "@/domain/call/stats";
import { Stats } from "@/domain/call/stats";
import type { IStatsAdapter } from "@/modules/media/ITransport";
import type { AudioEnginePort } from "@/ports/runtime/AudioEnginePort";
import type { PeerConnectionLike, StatEntry } from "@/ports/runtime/PeerConnectionPort";

/**
 * Tudo medido no peer local, sem nada do servidor. A latência de saída vem do motor de
 * áudio porque o `pc.getStats` não a expõe.
 */
export class RTCStatsAdapter implements IStatsAdapter {
    private cache: CallStats = Stats.empty();
    private prevBytesReceived = 0;
    private prevBytesSent = 0;
    private prevSampleTs = 0;

    constructor(
        private readonly pc: PeerConnectionLike,
        private readonly engine: AudioEnginePort,
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
        this.cache.latency.playout_ms = this.engine.outputLatency === null ? null : this.engine.outputLatency * 1000;
        this.cache.latency.total_ms = Stats.totalOf(this.cache.latency);
    }

    private absorbInbound(stat: AudioInboundStat): number {
        if (stat.bytesReceived) this.cache.packets.rx.bytes += stat.bytesReceived;
        if (stat.packetsLost) this.cache.packets.rx.lost = stat.packetsLost;
        if (stat.packetsReceived) this.cache.packets.rx.received = stat.packetsReceived;
        if (typeof stat.audioLevel === "number") this.cache.audio.rx.level = stat.audioLevel;
        if (typeof stat.jitter === "number") this.cache.audio.rx.jitter_ms = stat.jitter * 1000;
        this.absorbJitterBuffer(stat);
        return stat.bytesReceived ?? 0;
    }

    private absorbOutbound(stat: AudioOutboundStat): number {
        if (stat.bytesSent) this.cache.packets.tx.bytes += stat.bytesSent;
        return stat.bytesSent ?? 0;
    }

    /**
     * O atraso acumulado do jitter buffer dividido pelo que ele já entregou dá o atraso
     * médio por pacote, que é a forma padrão de ler esses dois campos do `getStats`.
     */
    private absorbJitterBuffer(stat: AudioInboundStat): void {
        if (!stat.jitterBufferDelay || !stat.jitterBufferEmittedCount) return;
        this.cache.latency.jitter_buffer_ms = (stat.jitterBufferDelay / stat.jitterBufferEmittedCount) * 1000;
    }

    private absorbMediaSource(stat: AudioMediaSourceStat): void {
        if (typeof stat.audioLevel === "number") this.cache.audio.tx.level = stat.audioLevel;
    }

    private absorbRemoteInbound(stat: RemoteInboundAudioStat): void {
        if (stat.packetsLost) this.cache.packets.tx.lost = stat.packetsLost;
        if (stat.packetsReceived) this.cache.packets.tx.sent = stat.packetsReceived;
        if (!stat.roundTripTime || !stat.roundTripTimeMeasurements) return;
        // O `getStats` dá o RTT em segundos; daqui para cima tudo é milissegundo.
        this.foldRtt(stat.roundTripTime * 1000, stat.roundTripTimeMeasurements);
        this.cache.latency.network_ms = (stat.roundTripTime * 1000) / 2;
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
                this.cache.audio.rx.bitrate_kbps = ((curBytesReceived - this.prevBytesReceived) * 8) / dtSec / 1000;
                this.cache.audio.tx.bitrate_kbps = ((curBytesSent - this.prevBytesSent) * 8) / dtSec / 1000;
            }
        }
        this.prevBytesReceived = curBytesReceived;
        this.prevBytesSent = curBytesSent;
        this.prevSampleTs = now;
    }
}

/** O que cada linha do `getStats` traz, do jeito que a porta a entrega. */
type AudioInboundStat = StatEntry & {
    jitterBufferDelay?: number;
    jitterBufferEmittedCount?: number;
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
