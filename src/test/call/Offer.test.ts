import { OfferProxy } from "@/modules/call/Offer";
import { _resetDeprecationWarnings } from "@/modules/shared/deprecation";
import { CallHarness, relayPlan, testPeer } from "@/test/support/CallHarness";
import { beforeEach, describe, expect, it, vi } from "vitest";

let harness: CallHarness;

beforeEach(() => {
    harness = new CallHarness();
    _resetDeprecationWarnings();
});

function makeOffer(release = vi.fn()) {
    const session = harness.incoming();
    return { session, release, offer: OfferProxy(session, release) };
}

function relayOffer() {
    const session = harness.incoming({ type: "UNOFFICIAL", remotePlan: relayPlan });
    return { session, offer: OfferProxy(session, vi.fn()) };
}

describe("Offer — getters", () => {
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

    it("device_token warns once and forwards", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const { offer } = makeOffer();

        expect(offer.device_token).toBe("device-token");
        expect(offer.device_token).toBe("device-token");

        expect(warn.mock.calls.filter((c) => String(c[0]).includes("Offer.device_token"))).toHaveLength(1);
        warn.mockRestore();
    });
});

describe("Offer — accept and reject", () => {
    it("accept returns the active call", async () => {
        const { offer } = makeOffer();

        const { call, err } = await offer.accept();

        expect(err).toBeNull();
        expect(call?.id).toBe("call-1");
    });

    it("accept reports the failure instead of throwing", async () => {
        const session = harness.incoming({ remotePlan: { type: "none" } });
        const offer = OfferProxy(session, vi.fn());

        const { call, err } = await offer.accept();

        expect(call).toBeNull();
        expect(err).toContain("Unsupported media plan type");
    });

    it("reject tells the server and leaves the routing at once", async () => {
        const { offer, release } = makeOffer();

        expect(await offer.reject()).toEqual({ err: null });
        expect(harness.signaling.sent).toEqual([{ command: "reject", callId: "call-1" }]);
        expect(release).toHaveBeenCalledOnce();
    });
});

describe("Offer — what the server says", () => {
    it.each([
        ["acceptedElsewhere", { type: "accepted" as const }],
        ["rejectedElsewhere", { type: "rejected" as const }],
        ["unanswered", { type: "unanswered" as const }],
        ["ended", { type: "ended" as const, status: "ENDED" as const }],
    ])("emits %s", (event, serverEvent) => {
        const { offer, session } = makeOffer();
        const heard = vi.fn();
        offer.on(event as "ended", heard);

        harness.fromServer(session, serverEvent);

        expect(heard).toHaveBeenCalledOnce();
    });

    it("delivers the cancelled outcome before tearing the offer down", () => {
        const { offer, session } = makeOffer();
        const seen: string[] = [];
        offer.on("status", (status) => seen.push(`status:${status}`));
        offer.on("ended", () => seen.push(`ended:${offer.status}`));

        harness.fromServer(session, { type: "ended", status: "CANCELLED" });

        expect(seen).toEqual(["status:CANCELLED", "ended:CANCELLED"]);
    });

    it("goes quiet after the offer is over", () => {
        const { offer, session } = makeOffer();
        harness.fromServer(session, { type: "ended", status: "ENDED" });
        const heard = vi.fn();
        offer.on("status", heard);

        harness.fromServer(session, { type: "ringing" });

        expect(heard).not.toHaveBeenCalled();
    });
});

describe("Offer — deprecated listeners", () => {
    it("onEnd warns once and fires on the terminal event", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const { offer, session } = relayOffer();
        const heard = vi.fn();

        offer.onEnd(heard);
        harness.fromServer(session, { type: "ended", status: "ENDED" });

        expect(heard).toHaveBeenCalledOnce();
        expect(warn.mock.calls.filter((c) => String(c[0]).includes("Offer.onEnd"))).toHaveLength(1);
        warn.mockRestore();
    });

    it("onStatus fires with the new status", () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const { offer, session } = relayOffer();
        const heard = vi.fn();

        offer.onStatus(heard);
        harness.fromServer(session, { type: "ringing" });

        expect(heard).toHaveBeenCalledWith("RINGING");
    });
});
