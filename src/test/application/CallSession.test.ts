import { CallSession, type CallSessionInit } from "@/application/call/CallSession";
import type { MediaPlan } from "@/domain/call/types";
import { Ack } from "@/ports/SignalingPort";
import { FakeCallSignaling } from "@/test/fakes/FakeCallSignaling";
import type { FakeRTCTransport, FakeTransport } from "@/test/fakes/FakeTransport";
import { FakeTransportFactory } from "@/test/fakes/FakeTransportFactory";
import { beforeEach, describe, expect, it, vi } from "vitest";

const peer = { phone: "5511999999999", displayName: "Test", profilePicture: null };
const webRTCPlan = { type: "webRTC" as const, sdp: "v=0 remote-offer" };
const relayPlan = { type: "relay" as const, host: "relay.host", port: "443" };

let signaling: FakeCallSignaling;
let transports: FakeTransportFactory;
let muted: boolean[];

beforeEach(() => {
    signaling = new FakeCallSignaling();
    transports = new FakeTransportFactory();
    muted = [];
});

function deps() {
    return { signaling, transports, setLocalMuted: (value: boolean) => muted.push(value) };
}

/** Oferta recebida: o transporte nasce do plano que veio nela. */
function makeSession(init: Partial<CallSessionInit> & { plan?: MediaPlan } = {}): CallSession {
    const { plan = webRTCPlan, ...rest } = init;
    return new CallSession(deps(), {
        id: "call-1",
        type: "OFFICIAL",
        direction: "INCOMING",
        peer,
        deviceToken: "device-token",
        status: "CALLING",
        transport: transports.forOffer(plan, "device-token"),
        ...rest,
    });
}

/** Disca de verdade: o transporte é montado antes do `call.start`, como em produção. */
async function dialedSession(type: CallSessionInit["type"] = "OFFICIAL"): Promise<CallSession> {
    const started = await CallSession.Start(deps(), { to: "5511999999999", type, deviceToken: "device-token" });
    if (!started.data) throw new Error(started.error.code);
    return started.data;
}

describe("CallSession — accepting an offer", () => {
    it("WebRTC: starts the media, accepts with the local answer and activates", async () => {
        const session = makeSession({ plan: webRTCPlan });
        const activated = vi.fn();
        session.on("activated", activated);

        await session.accept();

        expect(transports.plans).toEqual([webRTCPlan]);
        expect(transports.current.starts).toBe(1);
        expect(signaling.sent).toEqual([
            { command: "accept", callId: "call-1", payload: { type: "webRTC", sdp: "v=0 local-answer" } },
        ]);
        expect(session.status).toBe("ACTIVE");
        expect(activated).toHaveBeenCalledOnce();
    });

    it("WebRTC: a failed start releases the microphone and reports the failure", async () => {
        const session = makeSession({ plan: webRTCPlan });
        const media = transports.current;
        media.startFailure = new Error("Permission denied");

        const accepted = await session.accept();

        expect(accepted.error?.code).toBe("MEDIA_START_FAILED");
        expect(media.stops).toBe(1);
        expect(session.status).toBe("CALLING");
        expect(signaling.sent).toEqual([]);
    });

    it("relay: the call is active before the relay connects", async () => {
        const session = makeSession({ type: "UNOFFICIAL", plan: relayPlan });
        const relay = transports.current;
        relay.blockStart();
        const activated = vi.fn();
        session.on("activated", activated);

        await session.accept();

        expect(activated).toHaveBeenCalledOnce();
        expect(relay.connected).toBe(false);
        expect(signaling.sent).toEqual([{ command: "accept", callId: "call-1", payload: { type: "none" } }]);
        expect(session.status).toBe("ACTIVE");
    });

    it("cannot be built from a plan the media layer does not serve", () => {
        expect(() => transports.forOffer({ type: "none" }, "device-token")).not.toThrow();
    });

    it("rejecting only tells the server, keeping the status", () => {
        const session = makeSession({ plan: webRTCPlan });

        session.reject();

        expect(signaling.sent).toEqual([{ command: "reject", callId: "call-1" }]);
        expect(session.status).toBe("CALLING");
    });
});

describe("CallSession — outgoing call", () => {
    it("prepares the WebRTC offer before asking the server to call", async () => {
        const session = await dialedSession();

        expect(signaling.sent).toEqual([
            { command: "start", payload: { to: "5511999999999", plan: { type: "webRTC", sdp: "v=0 local-offer" } } },
        ]);
        expect(transports.current.starts).toBe(0);
        expect(session.status).toBe("RINGING");
    });

    it("UNOFFICIAL asks the server straight away, with the relay still unconnected", async () => {
        await dialedSession("UNOFFICIAL");

        expect(signaling.sent).toEqual([
            { command: "start", payload: { to: "5511999999999", plan: { type: "none" } } },
        ]);
        expect(transports.current.starts).toBe(0);
    });

    it("releases the prepared transport when the server refuses the call", async () => {
        signaling.startAnswer = Ack.Refuse("busy");

        const started = await CallSession.Start(deps(), {
            to: "5511999999999",
            type: "OFFICIAL",
            deviceToken: "device-token",
        });

        expect(started.error?.code).toBe("busy");
        expect(transports.current.stops).toBe(1);
    });

    it("the relay transport only learns where to connect when the peer answers", async () => {
        const session = await dialedSession("UNOFFICIAL");
        const relay = transports.current as FakeTransport;
        expect(relay.relay).toBeNull();

        session.handleServerEvent({ type: "answered", plan: relayPlan });
        await vi.waitFor(() => expect(relay.starts).toBe(1));

        expect(relay.relay).toEqual(relayPlan);
    });

    it("hands the prepared offer over when the peer answers", async () => {
        const session = await dialedSession();
        const prepared = transports.current as FakeRTCTransport;
        const activated = vi.fn();
        session.on("activated", activated);

        session.handleServerEvent({ type: "answered", plan: { type: "webRTC", sdp: "v=0 remote-answer" } });
        await vi.waitFor(() => expect(activated).toHaveBeenCalledOnce());

        expect(prepared.answers).toEqual(["v=0 remote-answer"]);
        expect(prepared.starts).toBe(1);
        expect(transports.opened).toHaveLength(1);
        expect(session.status).toBe("ACTIVE");
    });

    it("a failed handover stops the media and warns the outgoing call", async () => {
        const session = await dialedSession();
        const prepared = transports.current as FakeRTCTransport;
        prepared.startFailure = new Error("ICE failed");
        const handoverFailed = vi.fn();
        session.on("handoverFailed", handoverFailed);

        session.handleServerEvent({ type: "answered", plan: { type: "webRTC", sdp: "v=0 remote-answer" } });
        await vi.waitFor(() => expect(handoverFailed).toHaveBeenCalledOnce());

        expect(prepared.stops).toBe(1);
    });

    it("fails the handover when the answer does not fit the transport it dialed with", async () => {
        const session = await dialedSession();
        const prepared = transports.current as FakeRTCTransport;
        const handoverFailed = vi.fn();
        session.on("handoverFailed", handoverFailed);

        session.handleServerEvent({ type: "answered", plan: relayPlan });
        await vi.waitFor(() => expect(handoverFailed).toHaveBeenCalledOnce());

        expect(prepared.stops).toBe(1);
        expect(transports.opened).toHaveLength(1);
    });
});

describe("CallSession — cancelling", () => {
    it("moves to CANCELLED and releases the prepared media", async () => {
        const session = await dialedSession();

        expect((await session.cancel()).error).toBeNull();
        expect(session.status).toBe("CANCELLED");
        expect(transports.current.stops).toBe(1);
    });

    it("keeps the media when the peer answered first", async () => {
        const session = await dialedSession();
        signaling.cancelAnswer = Ack.Refuse("IS_NOT_OFFER");

        expect((await session.cancel()).error?.code).toBe("IS_NOT_OFFER");
        expect(transports.current.stops).toBe(0);
    });

    it("keeps the media on timeout: the call may still be answered", async () => {
        const session = await dialedSession();
        signaling.cancelAnswer = Ack.Timeout();

        expect((await session.cancel()).error?.code).toBe("ACK_TIMEOUT");
        expect(transports.current.stops).toBe(0);
    });

    it("releases the media on any other refusal", async () => {
        const session = await dialedSession();
        signaling.cancelAnswer = Ack.Refuse("CALL_NOT_FOUND");

        expect((await session.cancel()).error?.code).toBe("CALL_NOT_FOUND");
        expect(transports.current.stops).toBe(1);
    });

    it("refuses to cancel a call that is already active", async () => {
        const session = makeSession({ status: "ACTIVE", plan: relayPlan });

        expect((await session.cancel()).error?.code).toBe("IS_NOT_OFFER");
        expect(session.status).toBe("ACTIVE");
    });
});

describe("CallSession — ending and muting", () => {
    it("ends once, telling the server and stopping the media", async () => {
        const session = makeSession({ type: "UNOFFICIAL", plan: relayPlan });
        await session.accept();

        await session.end();
        await session.end();

        expect(signaling.commands().filter((c) => c === "end")).toHaveLength(1);
        expect(transports.current.stops).toBe(1);
    });

    it("mute from the outgoing call asks the server and applies only on success", async () => {
        const session = await dialedSession("UNOFFICIAL");

        expect((await session.mute(true)).error).toBeNull();
        expect(muted).toEqual([true]);

        signaling.muteAnswer = Ack.Refuse("CALL_NOT_FOUND");
        expect((await session.mute(false)).error?.code).toBe("CALL_NOT_FOUND");
        expect(muted).toEqual([true]);
    });

    it("mute tells the other side, whatever phase the call is in", async () => {
        const session = makeSession({ status: "ACTIVE" });

        expect((await session.mute(true)).error).toBeNull();

        expect(muted).toEqual([true]);
        expect(signaling.sent).toEqual([{ command: "mute", callId: "call-1", payload: true }]);
    });

    it("cancelling a call that already stopped does not ask the server again", async () => {
        const session = await dialedSession("UNOFFICIAL");
        await session.cancel();
        signaling.sent.length = 0;

        expect((await session.cancel()).error).toBeNull();
        expect(signaling.sent).toEqual([]);
    });

    it("rejecting moves the offer to REJECTED", async () => {
        const session = makeSession();

        expect((await session.reject()).error).toBeNull();
        expect(session.status).toBe("REJECTED");
    });
});

describe("CallSession — what the server says", () => {
    it("settles the status before notifying, in the router's order", () => {
        const session = makeSession({ direction: "OUTGOING", status: "RINGING" });
        const seen: string[] = [];
        session.on("rejected", () => seen.push(`rejected:${session.status}`));
        session.on("status", (status) => seen.push(`status:${status}`));

        session.handleServerEvent({ type: "rejected" });

        expect(seen).toEqual(["rejected:REJECTED", "status:REJECTED"]);
    });

    it("announces status before ended, so a teardown on ended still sees the outcome", () => {
        const session = makeSession({ status: "ACTIVE" });
        const seen: string[] = [];
        session.on("status", (status) => seen.push(`status:${status}`));
        session.on("ended", () => seen.push(`ended:${session.status}`));

        session.handleServerEvent({ type: "ended", status: "CANCELLED" });

        expect(seen).toEqual(["status:CANCELLED", "ended:CANCELLED"]);
    });

    it("stops the media on a terminal event", async () => {
        const session = makeSession({ type: "UNOFFICIAL", plan: relayPlan });
        await session.accept();

        session.handleServerEvent({ type: "failed", reason: "CONNECTION_TIMEOUT" });
        await vi.waitFor(() => expect(transports.current.stops).toBe(1));
    });

    it("reports a recoverable media drop as a status change", () => {
        const session = makeSession({ status: "ACTIVE" });
        const seen: string[] = [];
        session.on("status", (status) => seen.push(status));

        session.handleServerEvent({ type: "disconnected" });
        session.handleServerEvent({ type: "connected" });

        expect(seen).toEqual(["DISCONNECTED", "ACTIVE"]);
    });
});

describe("CallSession — stats", () => {
    const serverStats = {
        rtt: { client: { min: 10, max: 30, avg: 20 }, whatsapp: { min: 100, max: 300, avg: 200 } },
        tx: { total: 50, total_bytes: 5000, loss: 1 },
        rx: { total: 40, total_bytes: 4000, loss: 2 },
    };

    it("OFFICIAL reports only what the transport measured", async () => {
        const session = makeSession({ plan: webRTCPlan });
        await session.accept();

        session.handleServerEvent({ type: "stats", stats: serverStats });

        expect((await session.getStats()).rtt).toEqual({ min: 0, max: 0, avg: 0 });
    });

    it("UNOFFICIAL merges the server's RTT with what the client measures", async () => {
        const session = makeSession({ type: "UNOFFICIAL", plan: relayPlan });
        await session.accept();

        session.handleServerEvent({ type: "stats", stats: serverStats });

        expect((await session.getStats()).rtt).toEqual({ min: 10, max: 30, avg: 20 });
    });

    it("reports empty stats while there is no media", async () => {
        expect((await makeSession().getStats()).rtt).toEqual({ min: 0, max: 0, avg: 0 });
    });
});

describe("CallSession — media reports", () => {
    it("replays what ICE gathered before the media was wired", async () => {
        const session = await dialedSession();
        const prepared = transports.current as FakeRTCTransport;
        prepared.lastDiagnostics = {
            gatheringDurationMs: 120,
            gatheringTimedOut: false,
            candidatesByType: { host: 1, srflx: 1, prflx: 0, relay: 0 },
            stunReached: true,
            turnReached: false,
        };
        prepared.emittedConnectivityIssues = new Set(["NO_HOST_CANDIDATES"]);
        const diagnostics = vi.fn();
        const issues = vi.fn();
        session.on("iceDiagnostics", diagnostics);
        session.on("connectivityIssue", issues);

        session.handleServerEvent({ type: "answered", plan: { type: "webRTC", sdp: "v=0 remote-answer" } });
        await vi.waitFor(() => expect(diagnostics).toHaveBeenCalledOnce());

        expect(issues).toHaveBeenCalledWith("NO_HOST_CANDIDATES");
    });

    it("forwards the transport's own reports once wired", async () => {
        const session = makeSession({ type: "UNOFFICIAL", plan: relayPlan });
        await session.accept();
        const connection = vi.fn();
        session.on("connectionStatus", connection);

        transports.current.emit("statusChanged", "reconnecting");

        expect(connection).toHaveBeenCalledWith("reconnecting");
    });
});
