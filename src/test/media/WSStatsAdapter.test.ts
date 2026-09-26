import type { RelayMeasurements } from "@/modules/media/ITransport";
import { WSStatsAdapter } from "@/modules/media/relay/StatsAdapter";
import type { AudioEnginePort } from "@/ports/runtime/AudioEnginePort";
import { describe, expect, it, vi } from "vitest";

function makeEngine(outputLatency = 0): AudioEnginePort {
    return { outputLatency } as AudioEnginePort;
}

const zeroLevels: RelayMeasurements = { readTxLevel: () => 0, readRxLevel: () => 0, readBufferedMs: () => null };

describe("WSStatsAdapter", () => {
    it("snapshot() returns empty CallStats before any note/refresh", () => {
        const adapter = new WSStatsAdapter(makeEngine(), zeroLevels);
        const s = adapter.snapshot();
        expect(s.packets.tx.bytes).toBe(0);
        expect(s.packets.rx.bytes).toBe(0);
        expect(s.audio.rx.jitter_ms).toBe(0);
    });

    it("noteSent accumulates tx bytes and frame count", () => {
        const adapter = new WSStatsAdapter(makeEngine(), zeroLevels);
        adapter.noteSent(160);
        adapter.noteSent(160);
        const s = adapter.snapshot();
        expect(s.packets.tx.bytes).toBe(320);
        expect(s.packets.tx.sent).toBe(2);
    });

    it("noteReceived accumulates rx counters and updates jitter from arrival cadence", () => {
        let t = 1000;
        const spy = vi.spyOn(performance, "now").mockImplementation(() => t);

        const adapter = new WSStatsAdapter(makeEngine(), zeroLevels);
        adapter.noteReceived(160);
        t = 1040;
        adapter.noteReceived(160);
        t = 1060;
        adapter.noteReceived(160);

        const s = adapter.snapshot();
        expect(s.packets.rx.bytes).toBe(480);
        expect(s.packets.rx.received).toBe(3);
        // 1ª chegada: sem anterior, não mexe no jitter.
        // 2ª: |40 - 20| / 16 = 1.25
        // 3ª: 1.25 + (|20 - 20| - 1.25) / 16 ≈ 1.17
        expect(s.audio.rx.jitter_ms).toBeGreaterThan(1);
        expect(s.audio.rx.jitter_ms).toBeLessThan(2);
        spy.mockRestore();
    });

    it("refresh() recomputes bitrate from byte deltas over elapsed time", async () => {
        let t = 5000;
        const spy = vi.spyOn(performance, "now").mockImplementation(() => t);

        const adapter = new WSStatsAdapter(makeEngine(), zeroLevels);
        adapter.noteSent(1000);
        await adapter.refresh();

        t = 6000;
        adapter.noteSent(2000);
        await adapter.refresh();

        const s = adapter.snapshot();
        expect(s.audio.tx.bitrate_kbps).toBeCloseTo((2000 * 8) / 1000);
        spy.mockRestore();
    });

    it("refresh() pulls the levels, the playback queue and the output latency", async () => {
        const adapter = new WSStatsAdapter(makeEngine(0.042), {
            readTxLevel: () => 0.5,
            readRxLevel: () => 0.7,
            readBufferedMs: () => 60,
        });
        await adapter.refresh();
        const s = adapter.snapshot();
        expect(s.audio.tx.level).toBe(0.5);
        expect(s.audio.rx.level).toBe(0.7);
        expect(s.latency.jitter_buffer_ms).toBe(60);
        expect(s.latency.playout_ms).toBeCloseTo(42);
        expect(s.latency.total_ms).toBeCloseTo(102);
    });

    it("leaves the latency unmeasured where the platform does not report it", async () => {
        const adapter = new WSStatsAdapter({ outputLatency: null } as AudioEnginePort, zeroLevels);

        await adapter.refresh();

        expect(adapter.snapshot().latency).toEqual({
            total_ms: null,
            network_ms: null,
            whatsapp_ms: null,
            jitter_buffer_ms: null,
            playout_ms: null,
        });
    });
});
