import type { CallStats, ServerCallStats } from "@/domain/call/stats";
import { Stats } from "@/domain/call/stats";
import { describe, expect, it } from "vitest";

const serverStats: ServerCallStats = {
    rtt: { client: { min: 10, max: 30, avg: 20 }, whatsapp: { min: 100, max: 300, avg: 200 } },
    tx: { total: 50, total_bytes: 5000, loss: 1 },
    rx: { total: 40, total_bytes: 4000, loss: 2 },
};

function transportStats(): CallStats {
    const s = Stats.empty();
    s.rtt = { min: 999, max: 999, avg: 999 };
    s.audio = { tx: { level: 0.4, bitrate_kbps: 32 }, rx: { level: 0.2, bitrate_kbps: 31, jitter_ms: 5 } };
    s.packets = { tx: { sent: 7, lost: 7, bytes: 700 }, rx: { received: 8, lost: 8, bytes: 800 } };
    s.latency = { ...s.latency, jitter_buffer_ms: 40, playout_ms: 12 };
    return s;
}

describe("Stats.fromServer", () => {
    it("takes both legs of the RTT and leaves what only the client measures unmeasured", () => {
        const projected = Stats.fromServer(serverStats);

        expect(projected.rtt).toEqual({ min: 10, max: 30, avg: 20 });
        expect(projected.latency.network_ms).toBe(10);
        expect(projected.latency.whatsapp_ms).toBe(100);
        expect(projected.latency.jitter_buffer_ms).toBeNull();
        expect(projected.latency.playout_ms).toBeNull();
        expect(projected.packets.tx).toEqual({ sent: 50, lost: 1, bytes: 5000 });
    });

    it("totals only what it measured", () => {
        expect(Stats.fromServer(serverStats).latency.total_ms).toBe(110);
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

    it("keeps RTT and packets from the server and the client-only fields from the transport", () => {
        const merged = Stats.mergeUnofficial(Stats.fromServer(serverStats), transportStats());

        expect(merged.rtt).toEqual({ min: 10, max: 30, avg: 20 });
        expect(merged.packets.rx).toEqual({ received: 40, lost: 2, bytes: 4000 });
        expect(merged.audio).toEqual({
            tx: { level: 0.4, bitrate_kbps: 32 },
            rx: { level: 0.2, bitrate_kbps: 31, jitter_ms: 5 },
        });
        expect(merged.latency).toEqual({
            network_ms: 10,
            whatsapp_ms: 100,
            jitter_buffer_ms: 40,
            playout_ms: 12,
            total_ms: 162,
        });
    });
});

describe("Stats.totalOf", () => {
    it("is null when nothing was measured", () => {
        expect(Stats.empty().latency.total_ms).toBeNull();
    });

    it("adds up only the measured parts", () => {
        expect(Stats.totalOf({ ...Stats.empty().latency, network_ms: 10, playout_ms: 5 })).toBe(15);
    });
});
