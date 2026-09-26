import { OutgoingCallProxy } from "@/modules/call/OutgoingCall";
import { Ack } from "@/ports/SignalingPort";
import type { FakeRTCTransport } from "@/test/fakes/FakeTransport";
import { CallHarness, relayPlan, testPeer } from "@/test/support/CallHarness";
import { beforeEach, describe, expect, it, vi } from "vitest";

let harness: CallHarness;

beforeEach(() => {
    harness = new CallHarness();
});

function makeOutgoing(type: "OFFICIAL" | "UNOFFICIAL" = "UNOFFICIAL") {
    const session = harness.outgoing({ type });
    return { session, outgoing: OutgoingCallProxy(session) };
}

describe("OutgoingCall — getters", () => {
    it("reads the call's identity from the session", () => {
        const { outgoing } = makeOutgoing();

        expect(outgoing).toMatchObject({
            id: "call-1",
            direction: "OUTGOING",
            deviceToken: "device-token",
            status: "RINGING",
        });
        expect(outgoing.peer).toEqual({ ...testPeer, muted: false });
    });

    it("follows the status the server announces", () => {
        const { outgoing, session } = makeOutgoing();

        harness.fromServer(session, { type: "rejected" });

        expect(outgoing.status).toBe("REJECTED");
    });
});

describe("OutgoingCall — the peer answers", () => {
    it("says when the server confirms the peer's phone is ringing", () => {
        const { outgoing, session } = makeOutgoing();
        const ringing = vi.fn();
        outgoing.on("ringing", ringing);

        harness.fromServer(session, { type: "ringing" });

        expect(ringing).toHaveBeenCalledOnce();
        expect(outgoing.status).toBe("RINGING");
    });

    it("says the peer picked up before the media is up", async () => {
        const { outgoing, session } = makeOutgoing();
        const order: string[] = [];
        outgoing.on("answered", () => order.push("answered"));
        outgoing.on("accepted", () => order.push("accepted"));

        harness.fromServer(session, { type: "answered", plan: relayPlan });
        await vi.waitFor(() => expect(order).toHaveLength(2));

        expect(order).toEqual(["answered", "accepted"]);
    });

    /**
     * Sem teto, um `connect()` que não volta deixava a chamada em ACTIVE sem áudio e sem
     * falha — e o telefone do outro lado em "conectando" para sempre.
     */
    it("gives up on the media handover when it never finishes", async () => {
        vi.useFakeTimers();
        const { outgoing, session } = makeOutgoing();
        const failed = vi.fn();
        outgoing.on("failed", failed);
        // O `connect()` do transporte falso passa pelo `start()`, que este bloqueio segura.
        harness.transports.current.blockStart();

        harness.fromServer(session, { type: "answered", plan: relayPlan });
        await vi.advanceTimersByTimeAsync(11_000);

        expect(failed).toHaveBeenCalledOnce();
        expect(failed.mock.calls[0][0].code).toBe("MEDIA_NEGOTIATION_FAILED");
        vi.useRealTimers();
    });

    it("hands the active call to accepted once the media is up", async () => {
        const { outgoing, session } = makeOutgoing();
        const accepted = vi.fn();
        outgoing.on("accepted", accepted);

        harness.fromServer(session, { type: "answered", plan: relayPlan });
        await vi.waitFor(() => expect(accepted).toHaveBeenCalledOnce());

        expect(accepted.mock.calls[0][0]).toMatchObject({ id: "call-1", status: "ACTIVE" });
    });

    it("reports a failed handover as a media failure", async () => {
        const { outgoing, session } = makeOutgoing("UNOFFICIAL");
        const failed = vi.fn();
        outgoing.on("failed", failed);
        const motivo = new Error("no mic");
        harness.transports.current.startFailure = motivo;

        harness.fromServer(session, { type: "answered", plan: relayPlan });
        // A causa vai junto: sem ela o integrador não sabe o que impediu a mídia de subir.
        await vi.waitFor(() =>
            expect(failed).toHaveBeenCalledWith({ code: "MEDIA_NEGOTIATION_FAILED", cause: motivo }),
        );
    });
});

describe("OutgoingCall — commands", () => {
    it("mute asks the server and applies only on success", async () => {
        const { outgoing } = makeOutgoing();

        expect(await outgoing.mute()).toEqual({ data: undefined, error: null });
        expect(harness.muted).toEqual([true]);
        expect(harness.signaling.sent).toEqual([{ command: "mute", callId: "call-1", payload: true }]);
    });

    it("mute reports the server's refusal and keeps the microphone as it was", async () => {
        const { outgoing } = makeOutgoing();
        harness.signaling.muteAnswer = Ack.Refuse("CALL_NOT_FOUND");

        expect(await outgoing.unmute()).toEqual({ data: null, error: { code: "CALL_NOT_FOUND", cause: undefined } });
        expect(harness.muted).toEqual([]);
    });

    it("cancel moves the call to CANCELLED", async () => {
        const { outgoing } = makeOutgoing();

        expect(await outgoing.cancel()).toEqual({ data: undefined, error: null });
        expect(outgoing.status).toBe("CANCELLED");
    });

    it.each([
        [Ack.Refuse("CALL_ALREADY_ANSWERED"), "CALL_ALREADY_ANSWERED"],
        [Ack.Timeout(), "ACK_TIMEOUT"],
    ])("cancel reports %o as %s", async (answer, code) => {
        const { outgoing } = makeOutgoing();
        harness.signaling.cancelAnswer = answer;

        expect((await outgoing.cancel()).error?.code).toBe(code);
        expect(outgoing.status).toBe("RINGING");
    });
});

describe("OutgoingCall — what the server says", () => {
    it("does not report ended when the call was cancelled from here", async () => {
        const { outgoing, session } = makeOutgoing();
        const ended = vi.fn();
        outgoing.on("ended", ended);

        await outgoing.cancel();
        harness.fromServer(session, { type: "ended", status: "CANCELLED" });

        expect(ended).not.toHaveBeenCalled();
        expect(outgoing.status).toBe("CANCELLED");
    });

    it.each([
        ["rejected", { type: "rejected" as const }],
        ["unanswered", { type: "unanswered" as const }],
        ["ended", { type: "ended" as const, status: "ENDED" as const }],
    ])("emits %s", (event, serverEvent) => {
        const { outgoing, session } = makeOutgoing();
        const heard = vi.fn();
        outgoing.on(event as "ended", heard);

        harness.fromServer(session, serverEvent);

        expect(heard).toHaveBeenCalledOnce();
    });

    it("sees the outcome already settled inside the listener", () => {
        const { outgoing, session } = makeOutgoing();
        let statusInListener: string | undefined;
        outgoing.on("rejected", () => {
            statusInListener = outgoing.status;
        });

        harness.fromServer(session, { type: "rejected" });

        expect(statusInListener).toBe("REJECTED");
    });

    it("forwards the ICE diagnostics the media reports", async () => {
        const { outgoing, session } = makeOutgoing("OFFICIAL");
        const media = harness.transports.current;
        const heard = vi.fn();
        const accepted = vi.fn();
        outgoing.on("connectivityIssue", heard);
        outgoing.on("accepted", accepted);

        harness.fromServer(session, { type: "answered", plan: { type: "webRTC", sdp: "v=0 answer" } });
        await vi.waitFor(() => expect(accepted).toHaveBeenCalledOnce());
        media.emit("connectivityIssue", "STUN_UNREACHABLE");

        expect(heard).toHaveBeenCalledWith("STUN_UNREACHABLE");
    });
});

/**
 * A coleta de candidatos roda dentro do `createOffer()`, antes de o `OutgoingCall` existir:
 * quem assina — e é sempre depois — precisa receber o que já aconteceu.
 */
describe("OutgoingCall — ICE", () => {
    it("replays the gathering that happened before the call existed", () => {
        const session = harness.outgoing({ type: "OFFICIAL" });
        const prepared = harness.transports.current as FakeRTCTransport;
        prepared.lastDiagnostics = {
            gatheringDurationMs: 2500,
            gatheringTimedOut: true,
            candidatesByType: { host: 1, srflx: 0, prflx: 0, relay: 0 },
            stunReached: false,
            turnReached: false,
        };
        prepared.emittedConnectivityIssues = new Set(["STUN_UNREACHABLE"]);
        const outgoing = OutgoingCallProxy(session);

        const diagnostics = vi.fn();
        const issues = vi.fn();
        outgoing.on("iceDiagnostics", diagnostics);
        outgoing.on("connectivityIssue", issues);

        expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({ gatheringTimedOut: true }));
        expect(issues).toHaveBeenCalledWith("STUN_UNREACHABLE");
    });

    it("reports the connection failing while the peer has not answered", () => {
        const { outgoing } = makeOutgoing("OFFICIAL");
        const issues = vi.fn();
        outgoing.on("connectivityIssue", issues);

        harness.transports.current.emit("connectivityIssue", "ICE_CONNECTION_FAILED");

        expect(issues).toHaveBeenCalledWith("ICE_CONNECTION_FAILED");
    });
});
