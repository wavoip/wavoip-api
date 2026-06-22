import type { CallStats, ServerCallStats } from "@/modules/call/Stats";
import { Call } from "@/modules/device/Call";
import type { Events as TransportEvents, IRTCTransport } from "@/modules/media/ITransport";
import { _resetDeprecationWarnings } from "@/modules/shared/deprecation";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const peer = { phone: "5511999999999", displayName: null, profilePicture: null };

function makeCall(type: "OFFICIAL" | "UNOFFICIAL" = "OFFICIAL") {
    return Call.CreateOffer("call-1", type, peer, "device-token");
}

function makeMockTransport(): IRTCTransport {
    const t = new EventEmitter<TransportEvents>() as unknown as IRTCTransport;
    (t as unknown as { kind: string }).kind = "webrtc";
    t.status = "disconnected";
    t.peerMuted = false;
    t.audioAnalyser = Promise.resolve({} as AnalyserNode);
    t.stats = {
        rtt: { min: 0, max: 0, avg: 0 },
        tx: { total: 0, total_bytes: 0, loss: 0, bitrate_kbps: 0, audio_level: 0 },
        rx: { total: 0, total_bytes: 0, loss: 0, bitrate_kbps: 0, audio_level: 0, jitter_ms: 0 },
        audio_context: { output_latency_ms: 0 },
    };
    t.lastDiagnostics = null;
    Object.defineProperty(t, "emittedConnectivityIssues", { value: new Set(), writable: true, configurable: true });
    t.start = vi.fn().mockResolvedValue(undefined);
    t.stop = vi.fn().mockResolvedValue(undefined);
    t.getStats = vi.fn().mockResolvedValue(t.stats);
    return t;
}

describe("Call.getStats — pull-based stats API", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        _resetDeprecationWarnings();
        warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    it("returns empty CallStats before any source has reported", async () => {
        const call = makeCall("OFFICIAL");
        const s = await call.getStats();
        expect(s.rtt).toEqual({ min: 0, max: 0, avg: 0 });
        expect(s.tx.total_bytes).toBe(0);
    });

    it("returns the latest OFFICIAL transport.getStats() value", async () => {
        const call = makeCall("OFFICIAL");
        const transport = makeMockTransport();
        call.wireTransport(transport);

        const stats: CallStats = {
            rtt: { min: 5, max: 15, avg: 10 },
            tx: { total: 50, total_bytes: 2500, loss: 1, bitrate_kbps: 42, audio_level: 0.5 },
            rx: { total: 48, total_bytes: 2400, loss: 0, bitrate_kbps: 40, audio_level: 0.6, jitter_ms: 3 },
            audio_context: { output_latency_ms: 30 },
        };
        (transport.getStats as ReturnType<typeof vi.fn>).mockResolvedValue(stats);

        const s = await call.getStats();
        expect(s).toEqual(stats);
        expect(transport.getStats).toHaveBeenCalled();
    });

    it("returns the merged UNOFFICIAL stats from server projection + transport pull", async () => {
        const call = makeCall("UNOFFICIAL");
        const transport = makeMockTransport();
        call.wireTransport(transport);

        const serverStats: ServerCallStats = {
            rtt: { client: { min: 10, max: 30, avg: 20 }, whatsapp: { min: 5, max: 15, avg: 9 } },
            tx: { total: 100, total_bytes: 5000, loss: 2 },
            rx: { total: 98, total_bytes: 4900, loss: 1 },
        };
        call.applyServerStats(serverStats);

        const transportStats: CallStats = {
            rtt: { min: 0, max: 0, avg: 0 },
            tx: { total: 0, total_bytes: 0, loss: 0, bitrate_kbps: 60, audio_level: 0.3 },
            rx: { total: 0, total_bytes: 0, loss: 0, bitrate_kbps: 58, audio_level: 0.4, jitter_ms: 12 },
            audio_context: { output_latency_ms: 42 },
        };
        (transport.getStats as ReturnType<typeof vi.fn>).mockResolvedValue(transportStats);

        const s = await call.getStats();
        expect(s.rtt).toEqual({ min: 10, max: 30, avg: 20 });
        expect(s.tx.total_bytes).toBe(5000);
        expect(s.tx.bitrate_kbps).toBe(60);
        expect(s.rx.jitter_ms).toBe(12);
        expect(s.audio_context.output_latency_ms).toBe(42);
    });

    it("call.on('stats', cb) emits warn-once deprecation", () => {
        const call = makeCall();
        call.on("stats", () => {});
        call.on("stats", () => {}); // second listener still allowed, no second warn

        const warnCalls = warnSpy.mock.calls.filter((c: unknown[]) =>
            String(c[0]).includes("Call.stats event"),
        );
        expect(warnCalls).toHaveLength(1);
    });

    it("call.on('serverStats', cb) emits warn-once deprecation", () => {
        const call = makeCall();
        call.on("serverStats", () => {});

        const warnCalls = warnSpy.mock.calls.filter((c: unknown[]) =>
            String(c[0]).includes("Call.serverStats event"),
        );
        expect(warnCalls).toHaveLength(1);
    });

    it("call.on('status', cb) does NOT warn", () => {
        const call = makeCall();
        call.on("status", () => {});

        expect(warnSpy).not.toHaveBeenCalled();
    });
});
