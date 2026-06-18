import type { CallStats, ServerCallStats } from "@/modules/call/Stats";
import { Call } from "@/modules/device/Call";
import type { ServerEvents } from "@/modules/device/WebSocket";
import type { ConnectivityIssue, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import type { ITransport, Events as TransportEvents } from "@/modules/media/ITransport";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import { describe, expect, it, vi } from "vitest";

const peer = { phone: "5511999999999", displayName: null, profilePicture: null };

function makeCall(id = "call-1") {
    return Call.CreateOffer(id, "OFFICIAL", peer, "device-token");
}

function makeMockSocket() {
    return new EventEmitter<Record<string, unknown[]>>() as never;
}

function emitSocket(socket: ReturnType<typeof makeMockSocket>, event: keyof ServerEvents, ...args: unknown[]) {
    (socket as unknown as EventEmitter<Record<string, unknown[]>>).emit(event as string, ...args);
}

function makeMockTransport(): ITransport {
    const t = new EventEmitter<TransportEvents>() as unknown as ITransport;
    t.status = "disconnected";
    t.peerMuted = false;
    t.audioAnalyser = Promise.resolve({} as AnalyserNode);
    t.stats = {
        rtt: { min: 0, max: 0, avg: 0 },
        tx: { total: 0, total_bytes: 0, loss: 0 },
        rx: { total: 0, total_bytes: 0, loss: 0 },
    };
    t.start = vi.fn().mockResolvedValue(undefined);
    t.stop = vi.fn().mockResolvedValue(undefined);
    return t;
}

describe("Call.wireSocket", () => {
    it("call:ringing emits 'ringing' and status RINGING", () => {
        const call = makeCall();
        const socket = makeMockSocket();
        call.wireSocket(socket);
        const ringingCb = vi.fn();
        const statusCb = vi.fn();
        call.on("ringing", ringingCb);
        call.on("status", statusCb);

        emitSocket(socket, "call:ringing", call.id);

        expect(ringingCb).toHaveBeenCalledOnce();
        expect(statusCb).toHaveBeenCalledWith("RINGING");
    });

    it("call:ended emits 'ended' and status ENDED", () => {
        const call = makeCall();
        const socket = makeMockSocket();
        call.wireSocket(socket);
        const endedCb = vi.fn();
        const statusCb = vi.fn();
        call.on("ended", endedCb);
        call.on("status", statusCb);

        emitSocket(socket, "call:ended", call.id);

        expect(endedCb).toHaveBeenCalledOnce();
        expect(statusCb).toHaveBeenCalledWith("ENDED");
    });

    it("ignores call:ended for different call id", () => {
        const call = makeCall("call-1");
        const socket = makeMockSocket();
        call.wireSocket(socket);
        const cb = vi.fn();
        call.on("ended", cb);

        emitSocket(socket, "call:ended", "other-call");

        expect(cb).not.toHaveBeenCalled();
    });

    it("call:accepted emits 'accepted' and status ACTIVE", () => {
        const call = makeCall();
        const socket = makeMockSocket();
        call.wireSocket(socket);
        const acceptedCb = vi.fn();
        const statusCb = vi.fn();
        call.on("accepted", acceptedCb);
        call.on("status", statusCb);

        emitSocket(socket, "call:accepted", call.id);

        expect(acceptedCb).toHaveBeenCalledOnce();
        expect(statusCb).toHaveBeenCalledWith("ACTIVE");
    });

    it("ignores call:accepted for different call id", () => {
        const call = makeCall("call-1");
        const socket = makeMockSocket();
        call.wireSocket(socket);
        const cb = vi.fn();
        call.on("accepted", cb);

        emitSocket(socket, "call:accepted", "other-call");

        expect(cb).not.toHaveBeenCalled();
    });

    it("call:answered emits 'answered' with mediaPlan", () => {
        const call = makeCall();
        const socket = makeMockSocket();
        call.wireSocket(socket);
        const cb = vi.fn();
        call.on("answered", cb);

        const mediaPlan = { type: "webRTC", sdp: "answer-sdp" };
        emitSocket(socket, "call:answered", call.id, mediaPlan);

        expect(cb).toHaveBeenCalledWith(mediaPlan);
    });

    it("ignores call:answered for different call id", () => {
        const call = makeCall("call-1");
        const socket = makeMockSocket();
        call.wireSocket(socket);
        const cb = vi.fn();
        call.on("answered", cb);

        emitSocket(socket, "call:answered", "other-call", { type: "webRTC", sdp: "sdp" });

        expect(cb).not.toHaveBeenCalled();
    });

    it("call:unanswered emits 'unanswered'", () => {
        const call = makeCall();
        const socket = makeMockSocket();
        call.wireSocket(socket);
        const cb = vi.fn();
        call.on("unanswered", cb);

        emitSocket(socket, "call:unanswered", call.id);

        expect(cb).toHaveBeenCalledOnce();
    });

    it("ignores call:unanswered for different call id", () => {
        const call = makeCall("call-1");
        const socket = makeMockSocket();
        call.wireSocket(socket);
        const cb = vi.fn();
        call.on("unanswered", cb);

        emitSocket(socket, "call:unanswered", "other-call");

        expect(cb).not.toHaveBeenCalled();
    });

    it("call:rejected emits 'rejected'", () => {
        const call = makeCall();
        const socket = makeMockSocket();
        call.wireSocket(socket);
        const cb = vi.fn();
        call.on("rejected", cb);

        emitSocket(socket, "call:rejected", call.id);

        expect(cb).toHaveBeenCalledOnce();
    });

    it("ignores call:rejected for different call id", () => {
        const call = makeCall("call-1");
        const socket = makeMockSocket();
        call.wireSocket(socket);
        const cb = vi.fn();
        call.on("rejected", cb);

        emitSocket(socket, "call:rejected", "other-call");

        expect(cb).not.toHaveBeenCalled();
    });

    it("call:failed emits 'failed' with err", () => {
        const call = makeCall();
        const socket = makeMockSocket();
        call.wireSocket(socket);
        const cb = vi.fn();
        call.on("failed", cb);

        emitSocket(socket, "call:failed", call.id, "boom");

        expect(cb).toHaveBeenCalledWith("boom");
    });

    it("call:stats emits 'serverStats'", () => {
        const call = makeCall();
        const socket = makeMockSocket();
        call.wireSocket(socket);
        const cb = vi.fn();
        call.on("serverStats", cb);

        const stats: ServerCallStats = {
            rtt: { client: { min: 10, max: 30, avg: 20 }, whatsapp: { min: 5, max: 15, avg: 9 } },
            tx: { total: 100, total_bytes: 5000, loss: 2 },
            rx: { total: 98, total_bytes: 4900, loss: 1 },
        };

        emitSocket(socket, "call:stats", call.id, stats);

        expect(cb).toHaveBeenCalledWith(stats);
    });

    it("ignores call:stats for different call id", () => {
        const call = makeCall("call-1");
        const socket = makeMockSocket();
        call.wireSocket(socket);
        const cb = vi.fn();
        call.on("serverStats", cb);

        const stats: ServerCallStats = {
            rtt: { client: { min: 0, max: 0, avg: 0 }, whatsapp: { min: 0, max: 0, avg: 0 } },
            tx: { total: 0, total_bytes: 0, loss: 0 },
            rx: { total: 0, total_bytes: 0, loss: 0 },
        };

        emitSocket(socket, "call:stats", "other-call", stats);

        expect(cb).not.toHaveBeenCalled();
    });

    it("returned Unsubscribe removes all socket listeners", () => {
        const call = makeCall();
        const socket = makeMockSocket();
        const unsub = call.wireSocket(socket);
        const ringingCb = vi.fn();
        call.on("ringing", ringingCb);

        unsub();
        emitSocket(socket, "call:ringing", call.id);

        expect(ringingCb).not.toHaveBeenCalled();
    });

    it("auto-disposes socket listeners after terminal call:ended (B2)", () => {
        const call = makeCall();
        const socket = makeMockSocket();
        call.wireSocket(socket);
        const ringingCb = vi.fn();
        call.on("ringing", ringingCb);

        emitSocket(socket, "call:ended", call.id);
        emitSocket(socket, "call:ringing", call.id);

        expect(ringingCb).not.toHaveBeenCalled();
    });

    it("auto-disposes socket listeners after terminal call:rejected (B2)", () => {
        const call = makeCall();
        const socket = makeMockSocket();
        call.wireSocket(socket);
        const ringingCb = vi.fn();
        call.on("ringing", ringingCb);

        emitSocket(socket, "call:rejected", call.id);
        emitSocket(socket, "call:ringing", call.id);

        expect(ringingCb).not.toHaveBeenCalled();
    });

    it("auto-disposes socket listeners after terminal call:unanswered (B2)", () => {
        const call = makeCall();
        const socket = makeMockSocket();
        call.wireSocket(socket);
        const ringingCb = vi.fn();
        call.on("ringing", ringingCb);

        emitSocket(socket, "call:unanswered", call.id);
        emitSocket(socket, "call:ringing", call.id);

        expect(ringingCb).not.toHaveBeenCalled();
    });

    it("auto-disposes socket listeners after terminal call:failed (B2)", () => {
        const call = makeCall();
        const socket = makeMockSocket();
        call.wireSocket(socket);
        const ringingCb = vi.fn();
        call.on("ringing", ringingCb);

        emitSocket(socket, "call:failed", call.id, "boom");
        emitSocket(socket, "call:ringing", call.id);

        expect(ringingCb).not.toHaveBeenCalled();
    });

    it("ignores cross-call terminal events when filtering by id (no premature dispose)", () => {
        const call = makeCall("call-1");
        const socket = makeMockSocket();
        call.wireSocket(socket);
        const ringingCb = vi.fn();
        call.on("ringing", ringingCb);

        emitSocket(socket, "call:ended", "other-call");
        emitSocket(socket, "call:ringing", call.id);

        expect(ringingCb).toHaveBeenCalledOnce();
    });
});

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

    it("transport statusChanged 'disconnected' → emits connectionStatus AND 'ended'", () => {
        const call = makeCall();
        const transport = makeMockTransport();
        const connectionCb = vi.fn();
        const endedCb = vi.fn();
        call.on("connectionStatus", connectionCb);
        call.on("ended", endedCb);

        call.wireTransport(transport);
        (transport as unknown as EventEmitter<TransportEvents>).emit("statusChanged", "disconnected");

        expect(connectionCb).toHaveBeenCalledWith("disconnected");
        expect(endedCb).toHaveBeenCalledOnce();
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

    it("transport statsChanged → emits stats", () => {
        const call = makeCall();
        const transport = makeMockTransport();
        const cb = vi.fn();
        call.on("stats", cb);

        const stats: CallStats = {
            rtt: { min: 1, max: 5, avg: 3 },
            tx: { total: 100, total_bytes: 5000, loss: 2 },
            rx: { total: 98, total_bytes: 4900, loss: 1 },
        };

        call.wireTransport(transport);
        (transport as unknown as EventEmitter<TransportEvents>).emit("statsChanged", stats);

        expect(cb).toHaveBeenCalledWith(stats);
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
