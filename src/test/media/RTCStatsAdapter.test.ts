import { RTCStatsAdapter } from "@/modules/media/composition";
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

function makeAudioContext(outputLatency = 0): AudioContext {
    return { outputLatency } as AudioContext;
}

describe("RTCStatsAdapter", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
    });

    it("snapshot() returns empty CallStats before refresh", () => {
        const adapter = new RTCStatsAdapter(makePc([[]]), makeAudioContext());
        const s = adapter.snapshot();
        expect(s.rtt).toEqual({ min: 0, max: 0, avg: 0 });
        expect(s.rx.total_bytes).toBe(0);
        expect(s.tx.total_bytes).toBe(0);
    });

    it("absorbs inbound-rtp/audio into rx fields", async () => {
        const pc = makePc([[
            {
                type: "inbound-rtp",
                kind: "audio",
                bytesReceived: 1234,
                packetsReceived: 100,
                packetsLost: 2,
                audioLevel: 0.4,
                jitter: 0.012,
            },
        ]]);
        const adapter = new RTCStatsAdapter(pc, makeAudioContext(0.03));
        await adapter.refresh();
        const s = adapter.snapshot();
        expect(s.rx.total_bytes).toBe(1234);
        expect(s.rx.total).toBe(100);
        expect(s.rx.loss).toBe(2);
        expect(s.rx.audio_level).toBe(0.4);
        expect(s.rx.jitter_ms).toBeCloseTo(12);
        expect(s.audio_context.output_latency_ms).toBeCloseTo(30);
    });

    it("absorbs outbound-rtp/audio bytes into tx.total_bytes", async () => {
        const pc = makePc([[{ type: "outbound-rtp", kind: "audio", bytesSent: 500 }]]);
        const adapter = new RTCStatsAdapter(pc, makeAudioContext());
        await adapter.refresh();
        expect(adapter.snapshot().tx.total_bytes).toBe(500);
    });

    it("absorbs media-source/audio into tx.audio_level", async () => {
        const pc = makePc([[{ type: "media-source", kind: "audio", audioLevel: 0.7 }]]);
        const adapter = new RTCStatsAdapter(pc, makeAudioContext());
        await adapter.refresh();
        expect(adapter.snapshot().tx.audio_level).toBe(0.7);
    });

    it("absorbs remote-inbound-rtp/audio: tx loss/total + rolling RTT", async () => {
        const pc = makePc([[
            {
                type: "remote-inbound-rtp",
                kind: "audio",
                packetsLost: 3,
                packetsReceived: 200,
                roundTripTime: 0.04,
                roundTripTimeMeasurements: 1,
            },
        ]]);
        const adapter = new RTCStatsAdapter(pc, makeAudioContext());
        await adapter.refresh();
        const s = adapter.snapshot();
        expect(s.tx.loss).toBe(3);
        expect(s.tx.total).toBe(200);
        expect(s.rtt.avg).toBeCloseTo(0.04);
        expect(s.rtt.min).toBeCloseTo(0.04);
        expect(s.rtt.max).toBeCloseTo(0.04);
    });

    it("computes bitrate from byte deltas across consecutive refreshes", async () => {
        const pc = makePc([
            [{ type: "inbound-rtp", kind: "audio", bytesReceived: 1000 }],
            [{ type: "inbound-rtp", kind: "audio", bytesReceived: 3000 }],
        ]);
        const adapter = new RTCStatsAdapter(pc, makeAudioContext());

        const baseNow = 1_000;
        const spy = vi.spyOn(performance, "now");
        spy.mockReturnValueOnce(baseNow);
        await adapter.refresh();
        spy.mockReturnValueOnce(baseNow + 1000);
        await adapter.refresh();

        const s = adapter.snapshot();
        expect(s.rx.bitrate_kbps).toBeCloseTo(((3000 - 1000) * 8) / 1000);
        spy.mockRestore();
    });
});
