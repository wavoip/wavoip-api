import { CallActiveProxy } from "@/modules/call/CallActive";
import { CallOutgoingProxy } from "@/modules/call/CallOutgoing";
import { OfferProxy } from "@/modules/call/Offer";
import { Call } from "@/modules/device/Call";
import { CallRouter } from "@/modules/device/CallRouter";
import { FakeDeviceSocket } from "@/test/fakes/FakeDeviceSocket";
import { FakeMediaManager } from "@/test/fakes/FakeMediaManager";
import { FakeTransport } from "@/test/fakes/FakeTransport";
import { describe, expect, it } from "vitest";

const peer = { phone: "5511999999999", displayName: "Test", profilePicture: null };

function routeCall(call: Call): FakeDeviceSocket {
    const socket = new FakeDeviceSocket();
    const router = new CallRouter(socket.asDeviceSocket());
    router.start();
    router.register(call);
    return socket;
}

function makeOutgoing() {
    const call = new Call("call-1", "OFFICIAL", "OUTGOING", peer, "device-token", "RINGING");
    const socket = routeCall(call);
    const outgoing = CallOutgoingProxy(call, socket.asDeviceSocket(), new FakeMediaManager().asMediaManager());
    return { socket, outgoing };
}

function makeOffer() {
    const call = Call.CreateOffer("call-1", "OFFICIAL", peer, "device-token");
    const socket = routeCall(call);
    const offer = OfferProxy(call, {
        onAccept: () => Promise.reject("not under test"),
        onReject: () => {},
    });
    return { socket, offer };
}

function makeActive() {
    const call = Call.CreateOffer("call-1", "UNOFFICIAL", peer, "device-token");
    call.accept();
    const socket = routeCall(call);
    const active = CallActiveProxy(call, new FakeTransport(), new FakeMediaManager().asMediaManager(), {
        onEnd: () => {},
    });
    return { socket, active };
}

describe("status follows the server's call:* events", () => {
    it("outgoing call reads REJECTED after call:rejected, already inside peerReject", () => {
        const { socket, outgoing } = makeOutgoing();
        let seenInListener: string | undefined;
        outgoing.on("peerReject", () => {
            seenInListener = outgoing.status;
        });

        socket.receive("call:rejected", "call-1");

        expect(seenInListener).toBe("REJECTED");
        expect(outgoing.status).toBe("REJECTED");
    });

    it("outgoing call reads NOT_ANSWERED after call:unanswered", () => {
        const { socket, outgoing } = makeOutgoing();

        socket.receive("call:unanswered", "call-1");

        expect(outgoing.status).toBe("NOT_ANSWERED");
    });

    it("offer reads CANCELLED after the caller gives up, already inside ended", () => {
        const { socket, offer } = makeOffer();
        let seenInListener: string | undefined;
        offer.on("ended", () => {
            seenInListener = offer.status;
        });

        socket.receive("call:ended", "call-1", { status: "CANCELLED" });

        expect(seenInListener).toBe("CANCELLED");
        expect(offer.status).toBe("CANCELLED");
    });

    it("offer reads ACTIVE after being accepted elsewhere", () => {
        const { socket, offer } = makeOffer();

        socket.receive("call:accepted", "call-1");

        expect(offer.status).toBe("ACTIVE");
    });

    it("active call reads DISCONNECTED on call:disconnected and ACTIVE again on call:connected", () => {
        const { socket, active } = makeActive();

        socket.receive("call:disconnected", "call-1");
        expect(active.status).toBe("DISCONNECTED");

        socket.receive("call:connected", "call-1");
        expect(active.status).toBe("ACTIVE");
    });

    it("active call reads FAILED after call:failed", () => {
        const { socket, active } = makeActive();

        socket.receive("call:failed", "call-1", "CONNECTION_TIMEOUT");

        expect(active.status).toBe("FAILED");
    });

    it("active call reads ENDED after call:ended from an older instance without outcome", () => {
        const { socket, active } = makeActive();

        socket.receive("call:ended", "call-1");

        expect(active.status).toBe("ENDED");
    });
});
