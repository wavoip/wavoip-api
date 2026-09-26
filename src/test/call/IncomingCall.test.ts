import { IncomingCallProxy } from "@/modules/call/IncomingCall";
import { Ack } from "@/ports/SignalingPort";
import { CallHarness, relayPlan, testPeer } from "@/test/support/CallHarness";
import { beforeEach, describe, expect, it, vi } from "vitest";

let harness: CallHarness;

beforeEach(() => {
    harness = new CallHarness();
});

function makeOffer() {
    const session = harness.incoming();
    return { session, offer: IncomingCallProxy(session) };
}

function relayOffer() {
    const session = harness.incoming({ type: "UNOFFICIAL", plan: relayPlan });
    return { session, offer: IncomingCallProxy(session) };
}

describe("IncomingCall — getters", () => {
    it("reads the call's identity from the session", () => {
        const { offer } = makeOffer();

        expect(offer).toMatchObject({
            id: "call-1",
            type: "OFFICIAL",
            direction: "INCOMING",
            deviceToken: "device-token",
            status: "CALLING",
        });
        expect(offer.peer).toEqual({ ...testPeer, muted: false });
    });

    it("follows the status the server announces", () => {
        const { offer, session } = makeOffer();

        harness.fromServer(session, { type: "ended", status: "CANCELLED" });

        expect(offer.status).toBe("CANCELLED");
    });
});

describe("IncomingCall — accept and reject", () => {
    it("accept returns the active call", async () => {
        const { offer } = makeOffer();

        const { data, error } = await offer.accept();

        expect(error).toBeNull();
        expect(data?.id).toBe("call-1");
    });

    it("accept reports the failure instead of throwing", async () => {
        const { offer } = makeOffer();
        harness.transports.current.startFailure = new Error("Permission denied");

        const { data, error } = await offer.accept();

        expect(data).toBeNull();
        expect(error?.code).toBe("MEDIA_NEGOTIATION_FAILED");
        expect((error?.cause as Error).message).toBe("Permission denied");
    });

    it("reject tells the server and leaves the routing", async () => {
        const { offer, session } = makeOffer();

        expect(await offer.reject()).toEqual({ data: undefined, error: null });
        expect(harness.signaling.sent).toEqual([{ command: "reject", callId: "call-1" }]);
        expect(harness.registry.has(session.id)).toBe(false);
    });

    it("a refused reject keeps the offer routed, because it is still ringing", async () => {
        const { offer, session } = makeOffer();
        harness.signaling.rejectAnswer = Ack.Refuse("CALL_NOT_FOUND");

        expect(await offer.reject()).toEqual({ data: null, error: { code: "CALL_NOT_FOUND", cause: undefined } });
        expect(harness.registry.has(session.id)).toBe(true);
    });
});

describe("IncomingCall — what the server says", () => {
    it("does not report rejectedElsewhere when the offer was rejected from here", async () => {
        const { offer, session } = makeOffer();
        const elsewhere = vi.fn();
        offer.on("rejectedElsewhere", elsewhere);

        await offer.reject();
        harness.fromServer(session, { type: "rejected" });

        expect(elsewhere).not.toHaveBeenCalled();
    });

    it.each([
        ["acceptedElsewhere", { type: "accepted" as const }],
        ["rejectedElsewhere", { type: "rejected" as const }],
        ["cancelled", { type: "ended" as const, status: "CANCELLED" as const }],
        ["ended", { type: "unanswered" as const }],
        ["ended", { type: "ended" as const, status: "ENDED" as const }],
    ])("emits %s", (event, serverEvent) => {
        const { offer, session } = makeOffer();
        const heard = vi.fn();
        offer.on(event as "ended", heard);

        harness.fromServer(session, serverEvent);

        expect(heard).toHaveBeenCalledOnce();
    });

    it("has the status settled before the cancellation fires", () => {
        const { offer, session } = makeOffer();
        let seenInListener: string | undefined;
        offer.on("cancelled", () => {
            seenInListener = offer.status;
        });

        harness.fromServer(session, { type: "ended", status: "CANCELLED" });

        expect(seenInListener).toBe("CANCELLED");
    });

    it("goes quiet after the offer is over", () => {
        const { offer, session } = makeOffer();
        harness.fromServer(session, { type: "ended", status: "ENDED" });
        const heard = vi.fn();
        offer.on("ended", heard);

        harness.fromServer(session, { type: "ended", status: "ENDED" });

        expect(heard).not.toHaveBeenCalled();
    });
});
