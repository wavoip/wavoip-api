import { CallRegistry } from "@/application/call/CallRegistry";
import { CallSession } from "@/application/call/CallSession";
import { FakeCallSignaling } from "@/test/fakes/FakeCallSignaling";
import { FakeTransportFactory } from "@/test/fakes/FakeTransportFactory";
import { beforeEach, describe, expect, it, vi } from "vitest";

const peer = { phone: "5511999999999", displayName: "Test", profilePicture: null };

let signaling: FakeCallSignaling;
let registry: CallRegistry;

beforeEach(() => {
    signaling = new FakeCallSignaling();
    registry = new CallRegistry(signaling);
});

function session(id: string): CallSession {
    const transports = new FakeTransportFactory();
    return new CallSession(
        { signaling, transports, setLocalMuted: () => {} },
        {
            id,
            type: "OFFICIAL",
            direction: "INCOMING",
            peer,
            deviceToken: "device-token",
            status: "CALLING",
            transport: transports.forCall("OFFICIAL"),
        },
    );
}

describe("CallRegistry", () => {
    it("routes an event to the session with that id", () => {
        const first = session("call-1");
        const second = session("call-2");
        registry.register(first);
        registry.register(second);
        const heard = vi.fn();
        const notHeard = vi.fn();
        first.on("ringing", heard);
        second.on("ringing", notHeard);

        signaling.receiveCallEvent("call-1", { type: "ringing" });

        expect(heard).toHaveBeenCalledOnce();
        expect(notHeard).not.toHaveBeenCalled();
    });

    it("ignores an event for a call it does not know", () => {
        expect(() => signaling.receiveCallEvent("other-call", { type: "ringing" })).not.toThrow();
    });

    it.each([
        [{ type: "ended" as const, status: "ENDED" as const }],
        [{ type: "unanswered" as const }],
        [{ type: "rejected" as const }],
        [{ type: "failed" as const, error: { code: "CONNECTION_TIMEOUT" as const } }],
    ])("drops the call after %o", (event) => {
        registry.register(session("call-1"));

        signaling.receiveCallEvent("call-1", event);

        expect(registry.has("call-1")).toBe(false);
    });

    it("keeps the call through a recoverable media drop", () => {
        registry.register(session("call-1"));

        signaling.receiveCallEvent("call-1", { type: "disconnected" });

        expect(registry.has("call-1")).toBe(true);
    });

    it("still knows the call while its terminal listeners run", () => {
        const call = session("call-1");
        registry.register(call);
        let knownInListener: boolean | undefined;
        call.on("ended", () => {
            knownInListener = registry.has("call-1");
        });

        signaling.receiveCallEvent("call-1", { type: "ended", status: "ENDED" });

        expect(knownInListener).toBe(true);
        expect(registry.has("call-1")).toBe(false);
    });

    it("drops a call that closed itself, without waiting for the server to echo it", async () => {
        const call = session("call-1");
        registry.register(call);

        await call.reject();

        expect(registry.has("call-1")).toBe(false);
    });

    it("stops listening and forgets its calls", () => {
        const call = session("call-1");
        registry.register(call);
        const heard = vi.fn();
        call.on("ringing", heard);

        registry.stop();
        signaling.receiveCallEvent("call-1", { type: "ringing" });

        expect(heard).not.toHaveBeenCalled();
        expect(registry.has("call-1")).toBe(false);
    });
});
