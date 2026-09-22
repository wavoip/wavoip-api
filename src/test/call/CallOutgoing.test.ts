import { CallOutgoingProxy } from "@/modules/call/CallOutgoing";
import { _resetDeprecationWarnings } from "@/modules/shared/deprecation";
import { Ack } from "@/ports/SignalingPort";
import { CallHarness, relayPlan, testPeer } from "@/test/support/CallHarness";
import { beforeEach, describe, expect, it, vi } from "vitest";

let harness: CallHarness;

beforeEach(() => {
    harness = new CallHarness();
    _resetDeprecationWarnings();
});

function makeOutgoing(type: "OFFICIAL" | "UNOFFICIAL" = "UNOFFICIAL") {
    const session = harness.outgoing({ type });
    return { session, outgoing: CallOutgoingProxy(session) };
}

describe("CallOutgoing — getters", () => {
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

describe("CallOutgoing — the peer answers", () => {
    it("hands the active call to peerAccept once the media is up", async () => {
        const { outgoing, session } = makeOutgoing();
        const accepted = vi.fn();
        outgoing.on("peerAccept", accepted);

        harness.fromServer(session, { type: "answered", plan: relayPlan });
        await vi.waitFor(() => expect(accepted).toHaveBeenCalledOnce());

        expect(accepted.mock.calls[0][0]).toMatchObject({ id: "call-1", status: "ACTIVE" });
    });

    it("reports a failed handover as the end of the call", async () => {
        const { outgoing, session } = makeOutgoing("UNOFFICIAL");
        const ended = vi.fn();
        outgoing.on("ended", ended);
        harness.transports.current.startFailure = new Error("no mic");

        harness.fromServer(session, { type: "answered", plan: relayPlan });
        await vi.waitFor(() => expect(ended).toHaveBeenCalledOnce());
    });
});

describe("CallOutgoing — commands", () => {
    it("mute asks the server and applies only on success", async () => {
        const { outgoing } = makeOutgoing();

        expect(await outgoing.mute()).toEqual({ err: null });
        expect(harness.muted).toEqual([true]);
        expect(harness.signaling.sent).toEqual([{ command: "mute", callId: "call-1", payload: true }]);
    });

    it("mute reports the server's refusal and keeps the microphone as it was", async () => {
        const { outgoing } = makeOutgoing();
        harness.signaling.muteAnswer = Ack.Refuse("CALL_NOT_FOUND");

        expect(await outgoing.unmute()).toEqual({ err: "CALL_NOT_FOUND" });
        expect(harness.muted).toEqual([]);
    });

    it("cancel moves the call to CANCELLED", async () => {
        const { outgoing } = makeOutgoing();

        expect(await outgoing.cancel()).toEqual({ err: null });
        expect(outgoing.status).toBe("CANCELLED");
    });

    it.each([
        [Ack.Refuse("IS_NOT_OFFER"), "IS_NOT_OFFER"],
        [Ack.Timeout(), "ACK_TIMEOUT"],
    ])("cancel reports %o as %s", async (answer, err) => {
        const { outgoing } = makeOutgoing();
        harness.signaling.cancelAnswer = answer;

        expect(await outgoing.cancel()).toEqual({ err });
        expect(outgoing.status).toBe("RINGING");
    });

    it("end is a deprecated alias of cancel", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const { outgoing } = makeOutgoing();

        expect(await outgoing.end()).toEqual({ err: null });

        expect(harness.signaling.sent.map((s) => s.command)).toEqual(["cancel"]);
        expect(warn.mock.calls.filter((c) => String(c[0]).includes("CallOutgoing.end"))).toHaveLength(1);
        warn.mockRestore();
    });
});

describe("CallOutgoing — what the server says", () => {
    it.each([
        ["peerReject", { type: "rejected" as const }],
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
        outgoing.on("peerReject", () => {
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
        outgoing.on("peerAccept", accepted);

        harness.fromServer(session, { type: "answered", plan: { type: "webRTC", sdp: "v=0 answer" } });
        await vi.waitFor(() => expect(accepted).toHaveBeenCalledOnce());
        media.emit("connectivityIssue", "STUN_UNREACHABLE");

        expect(heard).toHaveBeenCalledWith("STUN_UNREACHABLE");
    });
});
