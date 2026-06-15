import { CallOutgoingProxy } from "@/modules/call/CallOutgoing";
import { Call } from "@/modules/device/Call";
import type { DeviceSocket } from "@/modules/device/WebSocket";
import type { IceDiagnostics } from "@/modules/media/ICEDiagnostics";
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
    socket.emit = vi.fn(() => socket) as never;
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

describe("CallOutgoing diagnostics pass-through", () => {
    it("forwards call iceDiagnostics to consumer", () => {
        const call = makeCall();
        const socket = makeMockSocket();
        const mm = makeMockMediaManager();
        const outgoing = CallOutgoingProxy(call, socket, mm as never);

        const cb = vi.fn();
        outgoing.on("iceDiagnostics", cb);

        const diag: IceDiagnostics = {
            gatheringDurationMs: 50,
            gatheringTimedOut: false,
            candidatesByType: { host: 1, srflx: 1, prflx: 0, relay: 0 },
            stunReached: true,
            turnReached: false,
        };
        call.emit("iceDiagnostics", diag);

        expect(cb).toHaveBeenCalledWith(diag);
    });

    it("forwards call connectivityIssue to consumer", () => {
        const call = makeCall();
        const socket = makeMockSocket();
        const mm = makeMockMediaManager();
        const outgoing = CallOutgoingProxy(call, socket, mm as never);

        const cb = vi.fn();
        outgoing.on("connectivityIssue", cb);

        call.emit("connectivityIssue", "STUN_UNREACHABLE");

        expect(cb).toHaveBeenCalledWith("STUN_UNREACHABLE");
    });
});
