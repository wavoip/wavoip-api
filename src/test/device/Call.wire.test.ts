import type { CallStats, ServerCallStats } from "@/modules/call/Stats";
import { Call } from "@/modules/device/Call";
import type { ConnectivityIssue, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import type { IRTCTransport, Events as TransportEvents } from "@/modules/media/ITransport";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import { describe, expect, it, vi } from "vitest";

const peer = { phone: "5511999999999", displayName: null, profilePicture: null };

function makeCall(id = "call-1", type: "OFFICIAL" | "UNOFFICIAL" = "OFFICIAL") {
    return Call.CreateOffer(id, type, peer, "device-token");
}

function makeMockTransport(kind: "webrtc" | "ws" = "webrtc"): IRTCTransport {
    const t = new EventEmitter<TransportEvents>() as unknown as IRTCTransport;
    (t as unknown as { kind: string }).kind = kind;
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
    return t;
}

describe("Call.wireTransport", () => {
    it("transport statusChanged 'connected' → emits connectionStatus 'connected'", () => {
        const call = makeCall();
        const transport = makeMockTransport();
        const cb = vi.fn();
        call.on("connectionStatus", cb);

        call.wireTransport(transport);
        (transport as unknown as EventEmitter<TransportEvents>).emit("statusChanged", "connected");

        expect(cb).toHaveBeenCalledWith("connected");
    });

    it("transport statusChanged 'reconnecting' → emits connectionStatus, NOT 'ended'", () => {
        const call = makeCall();
        const transport = makeMockTransport();
        const connectionCb = vi.fn();
        const endedCb = vi.fn();
        call.on("connectionStatus", connectionCb);
        call.on("ended", endedCb);

        call.wireTransport(transport);
        (transport as unknown as EventEmitter<TransportEvents>).emit("statusChanged", "reconnecting");

        expect(connectionCb).toHaveBeenCalledWith("reconnecting");
        expect(endedCb).not.toHaveBeenCalled();
    });

    it("transport statusChanged 'disconnected' → emits connectionStatus but NOT 'ended' (B3)", () => {
        const call = makeCall();
        const transport = makeMockTransport();
        const connectionCb = vi.fn();
        const endedCb = vi.fn();
        call.on("connectionStatus", connectionCb);
        call.on("ended", endedCb);

        call.wireTransport(transport);
        (transport as unknown as EventEmitter<TransportEvents>).emit("statusChanged", "disconnected");

        expect(connectionCb).toHaveBeenCalledWith("disconnected");
        expect(endedCb).not.toHaveBeenCalled();
    });

    it("transport peerMuted → emits peerMuted", () => {
        const call = makeCall();
        const transport = makeMockTransport();
        const cb = vi.fn();
        call.on("peerMuted", cb);

        call.wireTransport(transport);
        (transport as unknown as EventEmitter<TransportEvents>).emit("peerMuted", true);

        expect(cb).toHaveBeenCalledWith(true);
    });

    it("OFFICIAL transport statsChanged → emits stats", () => {
        const call = makeCall("call-1", "OFFICIAL");
        const transport = makeMockTransport();
        const cb = vi.fn();
        call.on("stats", cb);

        const stats: CallStats = {
            rtt: { min: 1, max: 5, avg: 3 },
            tx: { total: 100, total_bytes: 5000, loss: 2, bitrate_kbps: 0, audio_level: 0 },
            rx: { total: 98, total_bytes: 4900, loss: 1, bitrate_kbps: 0, audio_level: 0, jitter_ms: 0 },
            audio_context: { output_latency_ms: 0 },
        };

        call.wireTransport(transport);
        (transport as unknown as EventEmitter<TransportEvents>).emit("statsChanged", stats);

        expect(cb).toHaveBeenCalledWith(stats);
    });

    it("UNOFFICIAL transport statsChanged merges client-side fields into server-derived stats", () => {
        const call = makeCall("call-1", "UNOFFICIAL");
        const transport = makeMockTransport();
        call.wireTransport(transport);
        const cb = vi.fn();
        call.on("stats", cb);

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
        (transport as unknown as EventEmitter<TransportEvents>).emit("statsChanged", transportStats);

        const last = cb.mock.calls[cb.mock.calls.length - 1][0] as CallStats;
        expect(last.rtt).toEqual({ min: 10, max: 30, avg: 20 });
        expect(last.tx.total_bytes).toBe(5000);
        expect(last.tx.bitrate_kbps).toBe(60);
        expect(last.tx.audio_level).toBe(0.3);
        expect(last.rx.bitrate_kbps).toBe(58);
        expect(last.rx.audio_level).toBe(0.4);
        expect(last.rx.jitter_ms).toBe(12);
        expect(last.audio_context.output_latency_ms).toBe(42);
    });

    it("transport iceDiagnostics → emits iceDiagnostics", () => {
        const call = makeCall();
        const transport = makeMockTransport();
        const cb = vi.fn();
        call.on("iceDiagnostics", cb);

        const diag: IceDiagnostics = {
            gatheringDurationMs: 100,
            gatheringTimedOut: false,
            candidatesByType: { host: 1, srflx: 1, prflx: 0, relay: 0 },
            stunReached: true,
            turnReached: false,
        };

        call.wireTransport(transport);
        (transport as unknown as EventEmitter<TransportEvents>).emit("iceDiagnostics", diag);

        expect(cb).toHaveBeenCalledWith(diag);
    });

    it("transport connectivityIssue → emits connectivityIssue", () => {
        const call = makeCall();
        const transport = makeMockTransport();
        const cb = vi.fn();
        call.on("connectivityIssue", cb);

        call.wireTransport(transport);
        (transport as unknown as EventEmitter<TransportEvents>).emit("connectivityIssue", "STUN_UNREACHABLE");

        expect(cb).toHaveBeenCalledWith("STUN_UNREACHABLE");
    });

    it("replays transport.lastDiagnostics when wired late", () => {
        const call = makeCall();
        const transport = makeMockTransport();
        const diag: IceDiagnostics = {
            gatheringDurationMs: 200,
            gatheringTimedOut: false,
            candidatesByType: { host: 2, srflx: 1, prflx: 0, relay: 0 },
            stunReached: true,
            turnReached: false,
        };
        transport.lastDiagnostics = diag;

        const cb = vi.fn();
        call.on("iceDiagnostics", cb);

        call.wireTransport(transport);

        expect(cb).toHaveBeenCalledWith(diag);
    });

    it("skips ICE event subscriptions when transport kind is 'ws'", () => {
        const call = makeCall();
        const transport = makeMockTransport("ws");
        const iceCb = vi.fn();
        const issueCb = vi.fn();
        call.on("iceDiagnostics", iceCb);
        call.on("connectivityIssue", issueCb);

        call.wireTransport(transport);
        (transport as unknown as EventEmitter<TransportEvents>).emit("iceDiagnostics", {
            gatheringDurationMs: 1,
            gatheringTimedOut: false,
            candidatesByType: { host: 0, srflx: 0, prflx: 0, relay: 0 },
            stunReached: false,
            turnReached: false,
        });
        (transport as unknown as EventEmitter<TransportEvents>).emit("connectivityIssue", "STUN_UNREACHABLE");

        expect(iceCb).not.toHaveBeenCalled();
        expect(issueCb).not.toHaveBeenCalled();
    });

    it("replays transport.emittedConnectivityIssues when wired late", () => {
        const call = makeCall();
        const transport = makeMockTransport();
        const issues = new Set<ConnectivityIssue>(["STUN_UNREACHABLE", "NO_HOST_CANDIDATES"]);
        Object.defineProperty(transport, "emittedConnectivityIssues", {
            get: () => issues,
        });

        const cb = vi.fn();
        call.on("connectivityIssue", cb);

        call.wireTransport(transport);

        expect(cb).toHaveBeenCalledWith("STUN_UNREACHABLE");
        expect(cb).toHaveBeenCalledWith("NO_HOST_CANDIDATES");
        expect(cb).toHaveBeenCalledTimes(2);
    });
});
