import { CallBus } from "@/modules/call/CallBus";
import { Call } from "@/modules/device/Call";
import type { ConnectivityIssue, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import type { ITransport, Events as TransportEvents } from "@/modules/media/ITransport";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import { describe, expect, it, vi } from "vitest";

const peer = { phone: "5511999999999", displayName: null, profilePicture: null };

function makeCall() {
    return Call.CreateOffer("call-1", "OFFICIAL", peer, "device-token");
}

function makeMockSocket() {
    return new EventEmitter<Record<string, unknown[]>>() as never;
}

function makeMockTransport(): ITransport & {
    lastDiagnostics?: IceDiagnostics | null;
    emittedIssues?: ReadonlySet<ConnectivityIssue>;
} {
    const t = new EventEmitter<TransportEvents>() as unknown as ITransport & {
        lastDiagnostics?: IceDiagnostics | null;
        emittedIssues?: ReadonlySet<ConnectivityIssue>;
    };
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

describe("CallBus is sticky for iceDiagnostics + connectivityIssue", () => {
    it("immediately delivers cached iceDiagnostics to a late subscriber", () => {
        const bus = new CallBus(makeCall(), makeMockSocket());
        const diag: IceDiagnostics = {
            gatheringDurationMs: 50,
            gatheringTimedOut: false,
            candidatesByType: { host: 1, srflx: 1, prflx: 0, relay: 0 },
            stunReached: true,
            turnReached: false,
        };
        bus.emit("iceDiagnostics", diag);

        const cb = vi.fn();
        bus.on("iceDiagnostics", cb);

        expect(cb).toHaveBeenCalledWith(diag);
    });

    it("immediately delivers every cached connectivityIssue to a late subscriber", () => {
        const bus = new CallBus(makeCall(), makeMockSocket());
        bus.emit("connectivityIssue", "STUN_UNREACHABLE");
        bus.emit("connectivityIssue", "ICE_GATHERING_TIMEOUT");

        const cb = vi.fn();
        bus.on("connectivityIssue", cb);

        expect(cb).toHaveBeenCalledWith("STUN_UNREACHABLE");
        expect(cb).toHaveBeenCalledWith("ICE_GATHERING_TIMEOUT");
        expect(cb).toHaveBeenCalledTimes(2);
    });

    it("does not replay non-sticky events to late subscribers", () => {
        const bus = new CallBus(makeCall(), makeMockSocket());
        bus.emit("ringing");

        const cb = vi.fn();
        bus.on("ringing", cb);

        expect(cb).not.toHaveBeenCalled();
    });
});

describe("CallBus replays diagnostic state on wireTransport", () => {
    it("re-emits transport.lastDiagnostics when present", () => {
        const bus = new CallBus(makeCall(), makeMockSocket());
        const transport = makeMockTransport();
        const diag: IceDiagnostics = {
            gatheringDurationMs: 120,
            gatheringTimedOut: false,
            candidatesByType: { host: 1, srflx: 1, prflx: 0, relay: 0 },
            stunReached: true,
            turnReached: false,
        };
        transport.lastDiagnostics = diag;

        const cb = vi.fn();
        bus.on("iceDiagnostics", cb);

        bus.wireTransport(transport);

        expect(cb).toHaveBeenCalledWith(diag);
    });

    it("re-emits every issue in transport.emittedIssues when present", () => {
        const bus = new CallBus(makeCall(), makeMockSocket());
        const transport = makeMockTransport();
        transport.emittedIssues = new Set<ConnectivityIssue>(["STUN_UNREACHABLE", "ICE_GATHERING_TIMEOUT"]);

        const cb = vi.fn();
        bus.on("connectivityIssue", cb);

        bus.wireTransport(transport);

        expect(cb).toHaveBeenCalledWith("STUN_UNREACHABLE");
        expect(cb).toHaveBeenCalledWith("ICE_GATHERING_TIMEOUT");
        expect(cb).toHaveBeenCalledTimes(2);
    });

    it("does not replay when transport has no cached state", () => {
        const bus = new CallBus(makeCall(), makeMockSocket());
        const transport = makeMockTransport();

        const diagCb = vi.fn();
        const issueCb = vi.fn();
        bus.on("iceDiagnostics", diagCb);
        bus.on("connectivityIssue", issueCb);

        bus.wireTransport(transport);

        expect(diagCb).not.toHaveBeenCalled();
        expect(issueCb).not.toHaveBeenCalled();
    });
});

describe("WebRTCTransport exposes cached state", () => {
    it("populates lastDiagnostics + emittedIssues after createOffer", async () => {
        const { buildMockPeerConnection, makeMockMediaManager } = await import("@/test/media/ice-test-helpers");
        const { WebRTCTransport } = await import("@/modules/media/WebRTC");
        const pcFactory = buildMockPeerConnection();
        pcFactory.reset();
        vi.stubGlobal("RTCPeerConnection", pcFactory.MockRTCPeerConnection);
        vi.useFakeTimers();
        try {
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never, undefined, { gatheringTimeoutMs: 200 });
            const offerPromise = transport.createOffer();
            await vi.advanceTimersByTimeAsync(300);
            await offerPromise;

            expect(transport.lastDiagnostics).toBeDefined();
            expect(transport.lastDiagnostics?.gatheringTimedOut).toBe(true);
            expect(transport.emittedIssues.has("STUN_UNREACHABLE")).toBe(true);
        } finally {
            vi.unstubAllGlobals();
            vi.useRealTimers();
        }
    });
});
