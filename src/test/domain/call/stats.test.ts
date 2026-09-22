import { Stats } from "@/domain/call/stats";
import type { CallStats, ServerCallStats } from "@/domain/call/stats";
import { describe, expect, it } from "vitest";

const serverStats: ServerCallStats = {
    rtt: { client: { min: 10, max: 30, avg: 20 }, whatsapp: { min: 100, max: 300, avg: 200 } },
    tx: { total: 50, total_bytes: 5000, loss: 1 },
    rx: { total: 40, total_bytes: 4000, loss: 2 },
};

function transportStats(): CallStats {
    const s = Stats.empty();
    s.rtt = { min: 999, max: 999, avg: 999 };
    s.tx = { total: 7, total_bytes: 700, loss: 7, bitrate_kbps: 32, audio_level: 0.4 };
    s.rx = { total: 8, total_bytes: 800, loss: 8, bitrate_kbps: 31, audio_level: 0.2, jitter_ms: 5 };
    s.audio_context = { output_latency_ms: 12 };
    return s;
}

describe("Stats.fromServer", () => {
    it("takes the client leg RTT and zeroes what only the client measures", () => {
        const projected = Stats.fromServer(serverStats);

        expect(projected.rtt).toEqual({ min: 10, max: 30, avg: 20 });
        expect(projected.tx).toEqual({ total: 50, total_bytes: 5000, loss: 1, bitrate_kbps: 0, audio_level: 0 });
        expect(projected.rx.jitter_ms).toBe(0);
        expect(projected.audio_context.output_latency_ms).toBe(0);
    });
});

describe("Stats.mergeUnofficial", () => {
    it("is empty with neither side", () => {
        expect(Stats.mergeUnofficial(null, null)).toEqual(Stats.empty());
    });

    it("is the server projection alone before the transport reports", () => {
        const server = Stats.fromServer(serverStats);

        expect(Stats.mergeUnofficial(server, null)).toEqual(server);
    });

    it("keeps RTT, loss and totals from the server and client-only fields from the transport", () => {
        const merged = Stats.mergeUnofficial(Stats.fromServer(serverStats), transportStats());

        expect(merged.rtt).toEqual({ min: 10, max: 30, avg: 20 });
        expect(merged.tx).toEqual({ total: 50, total_bytes: 5000, loss: 1, bitrate_kbps: 32, audio_level: 0.4 });
        expect(merged.rx).toEqual({
            total: 40,
            total_bytes: 4000,
            loss: 2,
            bitrate_kbps: 31,
            audio_level: 0.2,
            jitter_ms: 5,
        });
        expect(merged.audio_context).toEqual({ output_latency_ms: 12 });
    });
});
