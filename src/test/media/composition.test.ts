import type { CallStats } from "@/modules/call/Stats";
import {
    type IAudioPipe,
    type IConnection,
    type IRTCConnection,
    type IStatsAdapter,
    type IWSConnection,
    isRTCConnection,
    isWSConnection,
} from "@/modules/media/composition";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import { describe, expect, it } from "vitest";

function emptyStats(): CallStats {
    return {
        rtt: { min: 0, max: 0, avg: 0 },
        tx: { total: 0, total_bytes: 0, loss: 0, bitrate_kbps: 0, audio_level: 0 },
        rx: { total: 0, total_bytes: 0, loss: 0, bitrate_kbps: 0, audio_level: 0, jitter_ms: 0 },
        audio_context: { output_latency_ms: 0 },
    };
}

describe("composition — discriminators", () => {
    it("isRTCConnection narrows on kind", () => {
        const rtc = {
            kind: "webrtc" as const,
            status: "disconnected" as const,
            start: async () => {},
            stop: async () => {},
        } as unknown as IRTCConnection;
        expect(isRTCConnection(rtc as unknown as IConnection)).toBe(true);
        expect(isWSConnection(rtc as unknown as IConnection)).toBe(false);
    });

    it("isWSConnection narrows on kind", () => {
        const ws = {
            kind: "ws" as const,
            status: "disconnected" as const,
            start: async () => {},
            stop: async () => {},
            send: () => {},
        } as unknown as IWSConnection;
        expect(isWSConnection(ws as unknown as IConnection)).toBe(true);
        expect(isRTCConnection(ws as unknown as IConnection)).toBe(false);
    });
});

describe("composition — IStatsAdapter contract", () => {
    it("snapshot() is synchronous and returns CallStats", () => {
        class Adapter implements IStatsAdapter {
            private cache = emptyStats();
            snapshot(): CallStats { return this.cache; }
            refresh(): Promise<void> { return Promise.resolve(); }
        }
        const a = new Adapter();
        const s = a.snapshot();
        expect(s).toBeDefined();
        expect(typeof s.rtt.avg).toBe("number");
    });

    it("refresh() returns Promise that callers can await", async () => {
        let refreshed = 0;
        class Adapter implements IStatsAdapter {
            snapshot(): CallStats { return emptyStats(); }
            async refresh(): Promise<void> { refreshed += 1; }
        }
        const a = new Adapter();
        await a.refresh();
        await a.refresh();
        expect(refreshed).toBe(2);
    });
});

describe("composition — IAudioPipe contract", () => {
    it("audioAnalyserIn and audioAnalyserOut are Promise<AnalyserNode>", () => {
        class Pipe extends EventEmitter<{ peerMuted: [muted: boolean] }> implements IAudioPipe {
            peerMuted = false;
            audioAnalyserIn = Promise.resolve({} as AnalyserNode);
            audioAnalyserOut = Promise.resolve({} as AnalyserNode);
            start = async () => {};
            stop = async () => {};
        }
        const p = new Pipe();
        expect(p.audioAnalyserIn).toBeInstanceOf(Promise);
        expect(p.audioAnalyserOut).toBeInstanceOf(Promise);
    });
});
