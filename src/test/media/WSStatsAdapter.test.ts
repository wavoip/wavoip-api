import { type AudioLevelProvider, WSStatsAdapter } from "@/modules/media/composition";
import { describe, expect, it, vi } from "vitest";

function makeAudioContext(outputLatency = 0): AudioContext {
    return { outputLatency } as AudioContext;
}

const zeroLevels: AudioLevelProvider = { readTxLevel: () => 0, readRxLevel: () => 0 };

describe("WSStatsAdapter", () => {

    it("snapshot() returns empty CallStats before any note/refresh", () => {
        const adapter = new WSStatsAdapter(makeAudioContext(), zeroLevels);
        const s = adapter.snapshot();
        expect(s.tx.total_bytes).toBe(0);
        expect(s.rx.total_bytes).toBe(0);
        expect(s.rx.jitter_ms).toBe(0);
    });

    it("noteSent accumulates tx bytes and frame count", () => {
        const adapter = new WSStatsAdapter(makeAudioContext(), zeroLevels);
        adapter.noteSent(160);
        adapter.noteSent(160);
        const s = adapter.snapshot();
        expect(s.tx.total_bytes).toBe(320);
        expect(s.tx.total).toBe(2);
    });

    it("noteReceived accumulates rx counters and updates jitter from arrival cadence", () => {
        let t = 1000;
        const spy = vi.spyOn(performance, "now").mockImplementation(() => t);

        const adapter = new WSStatsAdapter(makeAudioContext(), zeroLevels);
        adapter.noteReceived(160);
        t = 1040;
        adapter.noteReceived(160);
        t = 1060;
        adapter.noteReceived(160);

        const s = adapter.snapshot();
        expect(s.rx.total_bytes).toBe(480);
        expect(s.rx.total).toBe(3);
        // First arrival: lastRxArrivalTs == 0, skip jitter update.
        // Second arrival: |40 - 20| / 16 = 1.25
        // Third arrival:  prev = 1.25; |20 - 20| = 0; 1.25 + (0 - 1.25)/16 ≈ 1.17
        expect(s.rx.jitter_ms).toBeGreaterThan(1);
        expect(s.rx.jitter_ms).toBeLessThan(2);
        spy.mockRestore();
    });

    it("refresh() recomputes bitrate from byte deltas over elapsed time", async () => {
        let t = 5000;
        const spy = vi.spyOn(performance, "now").mockImplementation(() => t);

        const adapter = new WSStatsAdapter(makeAudioContext(), zeroLevels);
        adapter.noteSent(1000);
        await adapter.refresh();

        t = 6000;
        adapter.noteSent(2000);
        await adapter.refresh();

        const s = adapter.snapshot();
        expect(s.tx.bitrate_kbps).toBeCloseTo((2000 * 8) / 1000);
        spy.mockRestore();
    });

    it("refresh() pulls audio levels from the provider and outputLatency from context", async () => {
        const adapter = new WSStatsAdapter(makeAudioContext(0.042), {
            readTxLevel: () => 0.5,
            readRxLevel: () => 0.7,
        });
        await adapter.refresh();
        const s = adapter.snapshot();
        expect(s.tx.audio_level).toBe(0.5);
        expect(s.rx.audio_level).toBe(0.7);
        expect(s.audio_context.output_latency_ms).toBeCloseTo(42);
    });
});
