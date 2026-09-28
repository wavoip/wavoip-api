import { RTCStatsAdapter } from "@/modules/media/webrtc/StatsAdapter";
import type { AudioEnginePort } from "@/ports/runtime/AudioEnginePort";
import { beforeEach, describe, expect, it, vi } from "vitest";

type StatLike = Record<string, unknown> & { type: string; kind?: string };

function makeReport(stats: StatLike[]): RTCStatsReport {
    return new Map(stats.map((s, i) => [String(i), s])) as unknown as RTCStatsReport;
}

function makePc(reports: StatLike[][]): RTCPeerConnection {
    let i = 0;
    const getStats = vi.fn(async () => {
        const idx = Math.min(i, reports.length - 1);
        const r = makeReport(reports[idx]);
        i += 1;
        return r;
    });
    return { getStats } as unknown as RTCPeerConnection;
}

function makeEngine(outputLatency = 0): AudioEnginePort {
    return { outputLatency } as AudioEnginePort;
}

describe("RTCStatsAdapter", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
    });

    it("snapshot() returns empty CallStats before refresh", () => {
        const adapter = new RTCStatsAdapter(makePc([[]]), makeEngine());
        const s = adapter.snapshot();
        expect(s.rtt).toEqual({ min: 0, max: 0, avg: 0 });
        expect(s.packets.rx.bytes).toBe(0);
        expect(s.packets.tx.bytes).toBe(0);
    });

    it("absorbs inbound-rtp/audio into rx fields", async () => {
        const pc = makePc([
            [
                {
                    type: "inbound-rtp",
                    kind: "audio",
                    bytesReceived: 1234,
                    packetsReceived: 100,
                    packetsLost: 2,
                    audioLevel: 0.4,
                    jitter: 0.012,
                },
            ],
        ]);
        const adapter = new RTCStatsAdapter(pc, makeEngine(0.03));
        await adapter.refresh();
        const s = adapter.snapshot();
        expect(s.packets.rx.bytes).toBe(1234);
        expect(s.packets.rx.received).toBe(100);
        expect(s.packets.rx.lost).toBe(2);
        expect(s.audio.rx.level).toBe(0.4);
        expect(s.audio.rx.jitter_ms).toBeCloseTo(12);
        expect(s.latency.playout_ms).toBeCloseTo(30);
    });

    it("absorbs outbound-rtp/audio bytes into tx.total_bytes", async () => {
        const pc = makePc([[{ type: "outbound-rtp", kind: "audio", bytesSent: 500 }]]);
        const adapter = new RTCStatsAdapter(pc, makeEngine());
        await adapter.refresh();
        expect(adapter.snapshot().packets.tx.bytes).toBe(500);
    });

    it("absorbs media-source/audio into tx.audio_level", async () => {
        const pc = makePc([[{ type: "media-source", kind: "audio", audioLevel: 0.7 }]]);
        const adapter = new RTCStatsAdapter(pc, makeEngine());
        await adapter.refresh();
        expect(adapter.snapshot().audio.tx.level).toBe(0.7);
    });

    it("absorbs remote-inbound-rtp/audio: tx loss/total + rolling RTT", async () => {
        const pc = makePc([
            [
                {
                    type: "remote-inbound-rtp",
                    kind: "audio",
                    packetsLost: 3,
                    packetsReceived: 200,
                    roundTripTime: 0.04,
                    roundTripTimeMeasurements: 1,
                },
            ],
        ]);
        const adapter = new RTCStatsAdapter(pc, makeEngine());
        await adapter.refresh();
        const s = adapter.snapshot();
        expect(s.packets.tx.lost).toBe(3);
        expect(s.packets.tx.sent).toBe(200);
        // O getStats dá o RTT em segundos; a superfície fala milissegundo.
        expect(s.rtt.avg).toBeCloseTo(40);
        expect(s.rtt.min).toBeCloseTo(40);
        expect(s.rtt.max).toBeCloseTo(40);
        expect(s.latency.network_ms).toBeCloseTo(20);
    });

    it("reads the jitter buffer as the delay per packet it has emitted", async () => {
        const pc = makePc([
            [
                {
                    type: "inbound-rtp",
                    kind: "audio",
                    jitterBufferDelay: 12,
                    jitterBufferEmittedCount: 240,
                },
            ],
        ]);
        const adapter = new RTCStatsAdapter(pc, makeEngine());

        await adapter.refresh();

        expect(adapter.snapshot().latency.jitter_buffer_ms).toBeCloseTo(50);
    });

    it("computes bitrate from byte deltas across consecutive refreshes", async () => {
        const pc = makePc([
            [{ type: "inbound-rtp", kind: "audio", bytesReceived: 1000 }],
            [{ type: "inbound-rtp", kind: "audio", bytesReceived: 3000 }],
        ]);
        const adapter = new RTCStatsAdapter(pc, makeEngine());

        const baseNow = 1_000;
        const spy = vi.spyOn(performance, "now");
        spy.mockReturnValueOnce(baseNow);
        await adapter.refresh();
        spy.mockReturnValueOnce(baseNow + 1000);
        await adapter.refresh();

        const s = adapter.snapshot();
        expect(s.audio.rx.bitrate_kbps).toBeCloseTo(((3000 - 1000) * 8) / 1000);
        spy.mockRestore();
    });
});
