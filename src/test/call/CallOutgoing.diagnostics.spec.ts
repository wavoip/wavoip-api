import { CallBus } from "@/modules/call/CallBus";
import { CallOutgoingProxy } from "@/modules/call/CallOutgoing";
import { Call } from "@/modules/device/Call";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import { describe, expect, it, vi } from "vitest";

const peer = { phone: "5511999999999", displayName: "Test", profilePicture: null };

function makeCall() {
    return Call.CreateOffer("call-1", "OFFICIAL", peer, "device-token");
}

function makeMockBus(call: Call) {
    const socket = new EventEmitter<Record<string, unknown[]>>() as never;
    return new CallBus(call, socket);
}

function makeMockSocket() {
    return new EventEmitter<Record<string, unknown[]>>() as never;
}

function makeMockMediaManager() {
    return {
        setMuted: vi.fn(),
        startMedia: vi.fn(),
        stopMedia: vi.fn(),
        audioContext: {} as AudioContext,
    };
}

describe("CallOutgoing diagnostics", () => {
    it("on('iceDiagnostics') fires when bus emits iceDiagnostics", () => {
        const call = makeCall();
        const bus = makeMockBus(call);
        const outgoing = CallOutgoingProxy(call, bus, makeMockSocket(), makeMockMediaManager() as never);
        const cb = vi.fn();
        outgoing.on("iceDiagnostics", cb);

        const diag = {
            gatheringDurationMs: 75,
            gatheringTimedOut: false,
            candidatesByType: { host: 1, srflx: 1, prflx: 0, relay: 0 },
            stunReached: true,
            turnReached: false,
        };
        bus.emit("iceDiagnostics", diag);

        expect(cb).toHaveBeenCalledWith(diag);
    });

    it("on('connectivityIssue') fires when bus emits connectivityIssue", () => {
        const call = makeCall();
        const bus = makeMockBus(call);
        const outgoing = CallOutgoingProxy(call, bus, makeMockSocket(), makeMockMediaManager() as never);
        const cb = vi.fn();
        outgoing.on("connectivityIssue", cb);

        bus.emit("connectivityIssue", "STUN_UNREACHABLE");

        expect(cb).toHaveBeenCalledWith("STUN_UNREACHABLE");
    });
});
