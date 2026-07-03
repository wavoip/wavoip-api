import { describe, expect, it, vi } from "vitest";

// The non-preBuilt "answered" fallback in CallOutgoingProxy (unofficial outgoing
// calls, which never pre-build an offer) instantiates a real WebRTCTransport as
// answerer when the instance's UnofficialWebRTCBridge sends a late WebRTC offer.
// Mock it the same way DeviceConnection.test.ts does for the incoming-offer path.
vi.mock("@/modules/media/WebRTC", () => ({
    WebRTCTransport: class {
        answer = Promise.resolve({ sdp: "browser-answer-sdp" } as RTCSessionDescriptionInit);
        start = vi.fn().mockResolvedValue(undefined);
        stop = vi.fn().mockResolvedValue(undefined);
        setAnswer = vi.fn().mockResolvedValue(undefined);
        on = vi.fn();
        emit = vi.fn();
        off = vi.fn();
    },
}));

import { CallOutgoingProxy } from "@/modules/call/CallOutgoing";
import { Call } from "@/modules/device/Call";
import type { DeviceSocket } from "@/modules/device/WebSocket";
import { EventEmitter } from "@/modules/shared/EventEmitter";

const peer = { phone: "5511999999999", displayName: "Test", profilePicture: null };

function makeCall() {
    // UNOFFICIAL outgoing calls never receive a preBuiltTransport from
    // DeviceConnection.startCall() — only OFFICIAL does.
    return new Call("call-1", "UNOFFICIAL", "OUTGOING", peer, "device-token", "RINGING");
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

function makeMockMediaManager() {
    return {
        setMuted: vi.fn(),
        startMedia: vi.fn(),
        stopMedia: vi.fn(),
        audioContext: {} as AudioContext,
    };
}

describe("CallOutgoing — unofficial WebRTC bridge answer (no preBuiltTransport)", () => {
    it("emits call.media_answer (not call.accept) with the transport's answer sdp", async () => {
        const call = makeCall();
        const socket = makeMockSocket();
        const mm = makeMockMediaManager();

        CallOutgoingProxy(call, socket, mm as never);

        call.emit("answered", { type: "webRTC", sdp: "freeswitch-offer-sdp" });
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));

        expect(socket.emit).toHaveBeenCalledWith(
            "call.media_answer",
            "call-1",
            "browser-answer-sdp",
            expect.any(Function),
        );
        expect(socket.emit).not.toHaveBeenCalledWith(
            "call.accept",
            expect.anything(),
            expect.anything(),
            expect.anything(),
        );
    });
});
