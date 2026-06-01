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
    const e = new EventEmitter<Record<string, unknown[]>>();
    return Object.assign(e, { emit: vi.fn() }) as never;
}

function makeMockMediaManager() {
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    return {
        setMuted: vi.fn(),
        setMicrophone: vi.fn().mockResolvedValue(true),
        startMedia: vi.fn(),
        stopMedia: vi.fn(),
        audioContext: {} as AudioContext,
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event)?.add(cb);
            return () => listeners.get(event)?.delete(cb);
        }),
        emit: (event: string, ...args: unknown[]) => {
            for (const fn of listeners.get(event) ?? []) fn(...args);
        },
    };
}

describe("CallOutgoing.setMicrophone", () => {
    it("delegates to mediaManager.setMicrophone", async () => {
        const call = makeCall();
        const bus = makeMockBus(call);
        const wss = makeMockSocket();
        const mm = makeMockMediaManager();
        const outgoing = CallOutgoingProxy(call, bus, wss, mm as never);

        const result = await outgoing.setMicrophone("mic-2");

        expect(mm.setMicrophone).toHaveBeenCalledWith("mic-2");
        expect(result).toEqual({ err: null });
    });

    it("returns err when delegate fails", async () => {
        const call = makeCall();
        const bus = makeMockBus(call);
        const wss = makeMockSocket();
        const mm = makeMockMediaManager();
        mm.setMicrophone.mockResolvedValueOnce(false);
        const outgoing = CallOutgoingProxy(call, bus, wss, mm as never);

        const result = await outgoing.setMicrophone("missing");

        expect(result.err).toBeTruthy();
    });

    it("on('micChanged') fires when mediaManager emits micChanged", () => {
        const call = makeCall();
        const bus = makeMockBus(call);
        const wss = makeMockSocket();
        const mm = makeMockMediaManager();
        const outgoing = CallOutgoingProxy(call, bus, wss, mm as never);
        const cb = vi.fn();
        outgoing.on("micChanged", cb);

        const device = { kind: "audioinput", deviceId: "mic-2" } as MediaDeviceInfo;
        mm.emit("micChanged", device);

        expect(cb).toHaveBeenCalledWith(device);
    });
});
