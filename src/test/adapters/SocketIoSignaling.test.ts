import { SocketIoSignaling } from "@/adapters/socketio/SocketIoSignaling";
import type { ServerCallEvent } from "@/ports/SignalingPort";
import { FakeDeviceSocket } from "@/test/fakes/FakeDeviceSocket";
import { beforeEach, describe, expect, it, vi } from "vitest";

const peer = { phone: "5511999999999", displayName: "Test", profilePicture: null };
const relayPlan = { type: "relay" as const, host: "relay.host", port: "443" };

let socket: FakeDeviceSocket;
let signaling: SocketIoSignaling;

beforeEach(() => {
    socket = new FakeDeviceSocket();
    signaling = new SocketIoSignaling(socket.asDeviceSocket());
});

function lastSent() {
    return socket.sent[socket.sent.length - 1];
}

describe("SocketIoSignaling — what the server says", () => {
    it.each<[string, unknown[], ServerCallEvent]>([
        ["call:ringing", ["call-1"], { type: "ringing" }],
        ["call:accepted", ["call-1"], { type: "accepted" }],
        ["call:answered", ["call-1", relayPlan], { type: "answered", plan: relayPlan }],
        ["call:rejected", ["call-1"], { type: "rejected" }],
        ["call:unanswered", ["call-1"], { type: "unanswered" }],
        ["call:failed", ["call-1", "PEER_TX_TIMEOUT"], { type: "failed", error: { code: "LOCAL_AUDIO_TIMEOUT" } }],
        ["call:disconnected", ["call-1"], { type: "disconnected" }],
        ["call:connected", ["call-1"], { type: "connected" }],
        ["call:peer:muted", ["call-1", true], { type: "peerMuted", muted: true }],
    ])("translates %s", (name, args, expected) => {
        const heard = vi.fn();
        signaling.onCallEvent(heard);

        socket.receive(name, ...args);

        expect(heard).toHaveBeenCalledWith("call-1", expected);
    });

    it.each([
        [{ status: "CANCELLED" }, "CANCELLED"],
        [undefined, "ENDED"],
        [{ status: "ACCEPTED_ELSEWHERE" }, "ENDED"],
    ])("narrows the outcome %o of call:ended to %s", (outcome, status) => {
        const heard = vi.fn();
        signaling.onCallEvent(heard);

        socket.receive("call:ended", "call-1", outcome);

        expect(heard).toHaveBeenCalledWith("call-1", { type: "ended", status });
    });

    it("stops calling a listener that unsubscribed", () => {
        const heard = vi.fn();
        const unsubscribe = signaling.onCallEvent(heard);

        unsubscribe();
        socket.receive("call:ringing", "call-1");

        expect(heard).not.toHaveBeenCalled();
    });
});

describe("SocketIoSignaling — offers", () => {
    it("acknowledges delivery before any listener runs", () => {
        const order: string[] = [];
        const ackOffer = () => order.push("ack");
        signaling.onOffer(() => order.push("listener"));

        socket.receive("call:offer", { id: "call-1", peer, offer: relayPlan }, ackOffer);

        expect(order).toEqual(["ack", "listener"]);
    });

    it("delivers the offer with its plan", () => {
        const heard = vi.fn();
        signaling.onOffer(heard);

        socket.receive("call:offer", { id: "call-1", peer, offer: relayPlan }, vi.fn());

        expect(heard).toHaveBeenCalledWith({ id: "call-1", peer, plan: relayPlan });
    });
});

describe("SocketIoSignaling — commands", () => {
    it("starts a call and returns the id and the peer", async () => {
        socket.successResult = { id: "call-1", peer };

        const ack = await signaling.startCall("5511999999999", { type: "none" }, 10_000);

        expect(ack).toEqual({ kind: "ok", value: { id: "call-1", peer } });
        expect(lastSent()).toMatchObject({ event: "call.start", timeoutMs: 10_000 });
    });

    it.each([
        ["cancel", () => signaling.cancel("call-1", 10_000), "call.cancel"],
        ["mute", () => signaling.mute("call-1", true, 10_000), "call.mute"],
    ])("%s waits for the ack under a ceiling", async (_name, run, event) => {
        const ack = await run();

        expect(ack).toEqual({ kind: "ok", value: undefined });
        expect(lastSent()).toMatchObject({ event, timeoutMs: 10_000 });
    });

    it("translates the server's refusal into the library's vocabulary", async () => {
        socket.ackMode = "error";
        socket.errorCode = "IS_NOT_OFFER";

        expect(await signaling.cancel("call-1", 10_000)).toEqual({
            kind: "refused",
            code: "CALL_ALREADY_ANSWERED",
            cause: undefined,
        });
    });

    it("reports a refusal it does not know as UNKNOWN, keeping the raw code", async () => {
        socket.ackMode = "error";
        socket.errorCode = "CALL_LOCKED";

        expect(await signaling.cancel("call-1", 10_000)).toEqual({
            kind: "refused",
            code: "UNKNOWN",
            cause: "CALL_LOCKED",
        });
    });

    it("reports a timeout when the ack never arrives", async () => {
        socket.ackMode = "timeout";

        expect(await signaling.cancel("call-1", 10_000)).toEqual({ kind: "timeout" });
        expect(await signaling.startCall("5511", { type: "none" }, 10_000)).toEqual({ kind: "timeout" });
    });

    it.each([
        ["accept", () => signaling.accept("call-1", { type: "none" }, 10_000), "call.accept"],
        ["reject", () => signaling.reject("call-1", 10_000), "call.reject"],
        ["end", () => signaling.end("call-1", 10_000), "call.end"],
    ])("%s also waits for the ack under the same ceiling", async (_name, run, event) => {
        expect(await run()).toEqual({ kind: "ok", value: undefined });
        expect(lastSent()).toMatchObject({ event, timeoutMs: 10_000 });
    });

    it("reports the refusal of a command that used to be fire-and-forget", async () => {
        socket.ackMode = "error";
        socket.errorCode = "CALL_NOT_FOUND";

        expect(await signaling.end("call-1", 10_000)).toEqual({ kind: "refused", code: "CALL_NOT_FOUND" });
    });
});

describe("SocketIoSignaling — lifecycle", () => {
    it("binds one listener per server event, however many listeners it serves", () => {
        signaling.onCallEvent(vi.fn());
        signaling.onCallEvent(vi.fn());

        expect(socket.listenerCount("call:ringing")).toBe(1);
        expect(socket.listenerCount("call:offer")).toBe(1);
    });

    it("leaves the socket clean after dispose", () => {
        const heard = vi.fn();
        signaling.onCallEvent(heard);

        signaling.dispose();
        socket.receive("call:ringing", "call-1");

        expect(socket.listenerCount("call:ringing")).toBe(0);
        expect(heard).not.toHaveBeenCalled();
    });
});
