import type { CallStats } from "@/modules/call/Stats";
import { Call } from "@/modules/device/Call";
import type { ConnectivityIssue, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import type { IRTCTransport, Events as TransportEvents } from "@/modules/media/ITransport";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import { describe, expect, it, vi } from "vitest";

const peer = { phone: "5511999999999", displayName: null, profilePicture: null };

function makeCall(id = "call-1") {
    return Call.CreateOffer(id, "OFFICIAL", peer, "device-token");
}

function makeMockTransport(kind: "webrtc" | "ws" = "webrtc"): IRTCTransport {
    const t = new EventEmitter<TransportEvents>() as unknown as IRTCTransport;
    (t as unknown as { kind: string }).kind = kind;
    t.status = "disconnected";
    t.peerMuted = false;
    t.audioAnalyser = Promise.resolve({} as AnalyserNode);
    t.stats = {
        rtt: { min: 0, max: 0, avg: 0 },
        tx: { total: 0, total_bytes: 0, loss: 0 },
        rx: { total: 0, total_bytes: 0, loss: 0 },
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

    it("transport statsChanged is ignored — server call:stats is source of truth", () => {
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

        expect(cb).not.toHaveBeenCalled();
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
