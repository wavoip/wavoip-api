import { type CallStats, makeEmptyCallStats } from "@/modules/call/Stats";
import type { IStatsAdapter } from "@/modules/media/composition/StatsAdapter";

/**
 * WebRTC stats adapter — absorbs `pc.getStats()` reports into a single
 * `CallStats` cache. Extracted from the prior monolithic `WebRTCTransport.getStats`
 * so transport classes own only connection lifecycle; stats absorption lives
 * in a focused per-role module.
 *
 * Source mapping (all measured on the local peer; no server input):
 *   inbound-rtp/audio       → rx.{total_bytes, total, loss, audio_level, jitter_ms}
 *   outbound-rtp/audio      → tx.total_bytes  (bitrate derived in `updateBitrateSample`)
 *   media-source/audio      → tx.audio_level  (mic level pre-encode)
 *   remote-inbound-rtp/audio → tx.{loss, total} and rolling-mean rtt
 *
 * `audio_context.output_latency_ms` reads the `AudioContext.outputLatency`
 * directly each refresh, since `pc.getStats` doesn't expose it.
 */
export class RTCStatsAdapter implements IStatsAdapter {
    private cache: CallStats = makeEmptyCallStats();
    private prevBytesReceived = 0;
    private prevBytesSent = 0;
    private prevSampleTs = 0;

    constructor(
        private readonly pc: RTCPeerConnection,
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

    private absorbInbound(stat: RTCInboundRtpStreamStats & { audioLevel?: number; jitter?: number }): number {
        if (stat.bytesReceived) this.cache.rx.total_bytes += stat.bytesReceived;
        if (stat.packetsLost) this.cache.rx.loss = stat.packetsLost;
        if (stat.packetsReceived) this.cache.rx.total = stat.packetsReceived;
        if (typeof stat.audioLevel === "number") this.cache.rx.audio_level = stat.audioLevel;
        if (typeof stat.jitter === "number") this.cache.rx.jitter_ms = stat.jitter * 1000;
        return stat.bytesReceived ?? 0;
    }

    private absorbOutbound(stat: RTCOutboundRtpStreamStats): number {
        if (stat.bytesSent) this.cache.tx.total_bytes += stat.bytesSent;
        return stat.bytesSent ?? 0;
    }

    private absorbMediaSource(stat: { audioLevel?: number }): void {
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

type RemoteInboundAudioStat = RTCStats & {
    kind: "audio";
    packetsLost?: number;
    packetsReceived?: number;
    roundTripTime?: number;
    roundTripTimeMeasurements?: number;
};

function isAudioInbound(s: RTCStats): s is RTCInboundRtpStreamStats & { audioLevel?: number; jitter?: number } {
    return s.type === "inbound-rtp" && (s as RTCInboundRtpStreamStats).kind === "audio";
}

function isAudioOutbound(s: RTCStats): s is RTCOutboundRtpStreamStats {
    return s.type === "outbound-rtp" && (s as RTCOutboundRtpStreamStats).kind === "audio";
}

function isAudioMediaSource(s: RTCStats): s is RTCStats & { audioLevel?: number } {
    return s.type === "media-source" && (s as { kind?: string }).kind === "audio";
}

function isAudioRemoteInbound(s: RTCStats): s is RemoteInboundAudioStat {
    return s.type === "remote-inbound-rtp" && (s as RemoteInboundAudioStat).kind === "audio";
}
