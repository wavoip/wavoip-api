import { CallOutgoingProxy } from "@/modules/call/CallOutgoing";
import { CallBus } from "@/modules/call/CallBus";
import { Call } from "@/modules/device/Call";
import type { DeviceSocket } from "@/modules/device/WebSocket";
import type { WebRTCTransport } from "@/modules/media/WebRTC";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import { describe, expect, it, vi } from "vitest";

const peer = { phone: "5511999999999", displayName: "Test", profilePicture: null };

function makeCall() {
    return new Call("call-1", "OFFICIAL", "OUTGOING", peer, "device-token", "RINGING");
}

function makeMockSocket() {
    const socket = new EventEmitter<Record<string, unknown[]>>() as unknown as DeviceSocket & {
        emit: ReturnType<typeof vi.fn>;
    };
    socket.emit = vi.fn((_event: string, ..._args: unknown[]) => {
        const ack = _args[_args.length - 1];
        if (typeof ack === "function") (ack as (r: unknown) => void)({ type: "success" });
        return socket;
    }) as never;
    return socket;
}

function makeMockBus(call: Call) {
    const socket = new EventEmitter<Record<string, unknown[]>>() as never;
    return new CallBus(call, socket);
}

function makeMockMediaManager() {
    return {
        setMuted: vi.fn(),
        startMedia: vi.fn(),
        stopMedia: vi.fn(),
        on: vi.fn(() => () => {}),
        audioContext: {} as AudioContext,
    };
}

function makeMockPreBuiltTransport() {
    const t = new EventEmitter() as unknown as WebRTCTransport & {
        stop: ReturnType<typeof vi.fn>;
        start: ReturnType<typeof vi.fn>;
        setAnswer: ReturnType<typeof vi.fn>;
    };
    t.stop = vi.fn().mockResolvedValue(undefined);
    t.start = vi.fn().mockResolvedValue(undefined);
    t.setAnswer = vi.fn().mockResolvedValue(undefined);
    (t as unknown as { status: string }).status = "disconnected";
    (t as unknown as { peerMuted: boolean }).peerMuted = false;
    (t as unknown as { audioAnalyser: Promise<AnalyserNode> }).audioAnalyser = Promise.resolve({} as AnalyserNode);
    (t as unknown as { stats: object }).stats = {
        rtt: { min: 0, max: 0, avg: 0 },
        tx: { total: 0, total_bytes: 0, loss: 0 },
        rx: { total: 0, total_bytes: 0, loss: 0 },
    };
    return t;
}

describe("CallOutgoing", () => {
    describe("terminal cleanup (mic release pre-answer)", () => {
        it("stops preBuiltTransport on bus 'rejected'", () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const socket = makeMockSocket();
            const mm = makeMockMediaManager();
            const preBuilt = makeMockPreBuiltTransport();

            CallOutgoingProxy(call, bus, socket, mm as never, preBuilt);

            bus.emit("rejected");

            expect(preBuilt.stop).toHaveBeenCalledOnce();
        });

        it("stops preBuiltTransport on bus 'unanswered'", () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const socket = makeMockSocket();
            const mm = makeMockMediaManager();
            const preBuilt = makeMockPreBuiltTransport();

            CallOutgoingProxy(call, bus, socket, mm as never, preBuilt);

            bus.emit("unanswered");

            expect(preBuilt.stop).toHaveBeenCalledOnce();
        });

        it("stops preBuiltTransport on bus 'ended' before answer", () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const socket = makeMockSocket();
            const mm = makeMockMediaManager();
            const preBuilt = makeMockPreBuiltTransport();

            CallOutgoingProxy(call, bus, socket, mm as never, preBuilt);

            bus.emit("ended");

            expect(preBuilt.stop).toHaveBeenCalledOnce();
        });

        it("stops preBuiltTransport when consumer calls end()", async () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const socket = makeMockSocket();
            const mm = makeMockMediaManager();
            const preBuilt = makeMockPreBuiltTransport();

            const outgoing = CallOutgoingProxy(call, bus, socket, mm as never, preBuilt);

            await outgoing.end();

            expect(preBuilt.stop).toHaveBeenCalledOnce();
        });

        it("does not stop preBuiltTransport on 'answered' (handoff to CallActive)", async () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const socket = makeMockSocket();
            const mm = makeMockMediaManager();
            const preBuilt = makeMockPreBuiltTransport();

            CallOutgoingProxy(call, bus, socket, mm as never, preBuilt);

            bus.emit("answered", { type: "webRTC", sdp: "answer-sdp" });
            await new Promise((r) => setTimeout(r, 0));

            expect(preBuilt.stop).not.toHaveBeenCalled();
        });

        it("after answered handoff, bus 'ended' stops transport at most once (CallActive owns it)", async () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const socket = makeMockSocket();
            const mm = makeMockMediaManager();
            const preBuilt = makeMockPreBuiltTransport();

            CallOutgoingProxy(call, bus, socket, mm as never, preBuilt);

            bus.emit("answered", { type: "webRTC", sdp: "answer-sdp" });
            await new Promise((r) => setTimeout(r, 0));

            bus.emit("ended");

            expect(preBuilt.stop).toHaveBeenCalledTimes(1);
        });

        it("is idempotent — multiple terminal events stop preBuiltTransport once", () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const socket = makeMockSocket();
            const mm = makeMockMediaManager();
            const preBuilt = makeMockPreBuiltTransport();

            CallOutgoingProxy(call, bus, socket, mm as never, preBuilt);

            bus.emit("rejected");
            bus.emit("ended");
            bus.emit("unanswered");

            expect(preBuilt.stop).toHaveBeenCalledOnce();
        });

        it("no preBuiltTransport — terminal events do not throw", () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const socket = makeMockSocket();
            const mm = makeMockMediaManager();

            CallOutgoingProxy(call, bus, socket, mm as never);

            expect(() => bus.emit("ended")).not.toThrow();
            expect(() => bus.emit("rejected")).not.toThrow();
            expect(() => bus.emit("unanswered")).not.toThrow();
        });
    });

    describe("event forwarding", () => {
        it("forwards 'ended' to consumer", () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const socket = makeMockSocket();
            const mm = makeMockMediaManager();

            const outgoing = CallOutgoingProxy(call, bus, socket, mm as never);
            const cb = vi.fn();
            outgoing.on("ended", cb);

            bus.emit("ended");

            expect(cb).toHaveBeenCalledOnce();
        });

        it("forwards 'rejected' to peerReject consumer event", () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const socket = makeMockSocket();
            const mm = makeMockMediaManager();

            const outgoing = CallOutgoingProxy(call, bus, socket, mm as never);
            const cb = vi.fn();
            outgoing.on("peerReject", cb);

            bus.emit("rejected");

            expect(cb).toHaveBeenCalledOnce();
        });
    });
});
