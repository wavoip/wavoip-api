import { CallActiveProxy } from "@/modules/call/CallActive";
import { CallOutgoingProxy } from "@/modules/call/CallOutgoing";
import { OfferProxy } from "@/modules/call/Offer";
import { CallHarness, relayPlan } from "@/test/support/CallHarness";
import { beforeEach, describe, expect, it, vi } from "vitest";

let harness: CallHarness;

beforeEach(() => {
    harness = new CallHarness();
});

function outgoing() {
    const session = harness.outgoing({ type: "UNOFFICIAL" });
    return { session, view: CallOutgoingProxy(session) };
}

function offer() {
    const session = harness.incoming({ type: "UNOFFICIAL", remotePlan: relayPlan });
    return { session, view: OfferProxy(session, vi.fn()) };
}

function active() {
    const session = harness.incoming({ type: "UNOFFICIAL", remotePlan: relayPlan, status: "ACTIVE" });
    return { session, view: CallActiveProxy(session) };
}

describe("status follows the server's call:* events", () => {
    it("outgoing call reads REJECTED after a rejection, already inside peerReject", () => {
        const { session, view } = outgoing();
        let seenInListener: string | undefined;
        view.on("peerReject", () => {
            seenInListener = view.status;
        });

        harness.fromServer(session, { type: "rejected" });

        expect(seenInListener).toBe("REJECTED");
        expect(view.status).toBe("REJECTED");
    });

    it("outgoing call reads NOT_ANSWERED after a timeout", () => {
        const { session, view } = outgoing();

        harness.fromServer(session, { type: "unanswered" });

        expect(view.status).toBe("NOT_ANSWERED");
    });

    it("offer reads CANCELLED after the caller gives up, already inside ended", () => {
        const { session, view } = offer();
        let seenInListener: string | undefined;
        view.on("ended", () => {
            seenInListener = view.status;
        });

        harness.fromServer(session, { type: "ended", status: "CANCELLED" });

        expect(seenInListener).toBe("CANCELLED");
        expect(view.status).toBe("CANCELLED");
    });

    it("offer reads ACTIVE after being accepted elsewhere", () => {
        const { session, view } = offer();

        harness.fromServer(session, { type: "accepted" });

        expect(view.status).toBe("ACTIVE");
    });

    it("active call reads DISCONNECTED on a media drop and ACTIVE when it recovers", () => {
        const { session, view } = active();

        harness.fromServer(session, { type: "disconnected" });
        expect(view.status).toBe("DISCONNECTED");

        harness.fromServer(session, { type: "connected" });
        expect(view.status).toBe("ACTIVE");
    });

    it("active call reads FAILED after a failure", () => {
        const { session, view } = active();

        harness.fromServer(session, { type: "failed", reason: "CONNECTION_TIMEOUT" });

        expect(view.status).toBe("FAILED");
    });

    it("active call reads ENDED when an older instance sends no outcome", () => {
        const { session, view } = active();

        harness.fromServer(session, { type: "ended", status: "ENDED" });

        expect(view.status).toBe("ENDED");
    });
});
