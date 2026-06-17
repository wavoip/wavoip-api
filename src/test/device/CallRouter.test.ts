import type { CallStats, ServerCallStats } from "@/modules/call/Stats";
import { Call } from "@/modules/device/Call";
import { CallRouter } from "@/modules/device/CallRouter";
import type { DeviceSocket } from "@/modules/device/WebSocket";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import { describe, expect, it, vi } from "vitest";

const peer = { phone: "5511999999999", displayName: null, profilePicture: null };

function makeCall(id = "call-1") {
    return Call.CreateOffer(id, "OFFICIAL", peer, "device-token");
}

function makeMockSocket() {
    return new EventEmitter<Record<string, unknown[]>>() as never;
}

function emitSocket(socket: ReturnType<typeof makeMockSocket>, event: string, ...args: unknown[]) {
    (socket as unknown as EventEmitter<Record<string, unknown[]>>).emit(event, ...args);
}

function getListenerCount(socket: ReturnType<typeof makeMockSocket>, event: string): number {
    // Reach into EventEmitter internals — same hack used by the WS mock.
    const ee = socket as unknown as { listeners: Map<string, unknown[]> };
    return ee.listeners.get(event)?.length ?? 0;
}

describe("CallRouter", () => {
    describe("start()", () => {
        it("is idempotent — repeated start does not double-subscribe", () => {
            const socket = makeMockSocket();
            const router = new CallRouter(socket as unknown as DeviceSocket);

            router.start();
            const after1 = getListenerCount(socket, "call:ringing");
            router.start();
            const after2 = getListenerCount(socket, "call:ringing");

            expect(after2).toBe(after1);
        });
    });

    describe("dispatch", () => {
        it("call:ringing routes to the matching Call by id", () => {
            const socket = makeMockSocket();
            const router = new CallRouter(socket as unknown as DeviceSocket);
            router.start();
            const call = makeCall();
            router.register(call);
            const ringingCb = vi.fn();
            const statusCb = vi.fn();
            call.on("ringing", ringingCb);
            call.on("status", statusCb);

            emitSocket(socket, "call:ringing", call.id);

            expect(ringingCb).toHaveBeenCalledOnce();
            expect(statusCb).toHaveBeenCalledWith("RINGING");
        });

        it("ignores socket events for unregistered call ids", () => {
            const socket = makeMockSocket();
            const router = new CallRouter(socket as unknown as DeviceSocket);
            router.start();
            const call = makeCall("call-1");
            router.register(call);
            const cb = vi.fn();
            call.on("ringing", cb);

            emitSocket(socket, "call:ringing", "other-call");

            expect(cb).not.toHaveBeenCalled();
        });

        it("call:answered carries mediaPlan payload through to the Call", () => {
            const socket = makeMockSocket();
            const router = new CallRouter(socket as unknown as DeviceSocket);
            router.start();
            const call = makeCall();
            router.register(call);
            const cb = vi.fn();
            call.on("answered", cb);

            emitSocket(socket, "call:answered", call.id, { type: "webRTC", sdp: "abc" });

            expect(cb).toHaveBeenCalledWith({ type: "webRTC", sdp: "abc" });
        });

        it("call:stats forwards ServerCallStats payload to serverStats", () => {
            const socket = makeMockSocket();
            const router = new CallRouter(socket as unknown as DeviceSocket);
            router.start();
            const call = makeCall();
            router.register(call);
            const cb = vi.fn();
            call.on("serverStats", cb);

            const stats: ServerCallStats = {
                rtt: { client: { min: 1, max: 5, avg: 3 }, whatsapp: { min: 2, max: 6, avg: 4 } },
                tx: { total: 10, total_bytes: 100, loss: 0 },
                rx: { total: 9, total_bytes: 90, loss: 1 },
            };
            emitSocket(socket, "call:stats", call.id, stats);

            expect(cb).toHaveBeenCalledWith(stats);
        });

        it("call:stats also emits 'stats' projected from client-leg RTT and tx/rx", () => {
            const socket = makeMockSocket();
            const router = new CallRouter(socket as unknown as DeviceSocket);
            router.start();
            const call = makeCall();
            router.register(call);
            const cb = vi.fn();
            call.on("stats", cb);

            const stats: ServerCallStats = {
                rtt: { client: { min: 10, max: 30, avg: 20 }, whatsapp: { min: 5, max: 15, avg: 9 } },
                tx: { total: 100, total_bytes: 5000, loss: 2 },
                rx: { total: 98, total_bytes: 4900, loss: 1 },
            };
            emitSocket(socket, "call:stats", call.id, stats);

            expect(cb).toHaveBeenCalledWith({
                rtt: { min: 10, max: 30, avg: 20 },
                tx: { total: 100, total_bytes: 5000, loss: 2 },
                rx: { total: 98, total_bytes: 4900, loss: 1 },
            });
        });

        it("call:peer:muted emits peerMuted with the server-reported value", () => {
            const socket = makeMockSocket();
            const router = new CallRouter(socket as unknown as DeviceSocket);
            router.start();
            const call = makeCall();
            router.register(call);
            const cb = vi.fn();
            call.on("peerMuted", cb);

            emitSocket(socket, "call:peer:muted", call.id, true);

            expect(cb).toHaveBeenCalledWith(true);
        });

        it("multiple registered Calls each receive only their own events", () => {
            const socket = makeMockSocket();
            const router = new CallRouter(socket as unknown as DeviceSocket);
            router.start();
            const callA = makeCall("call-a");
            const callB = makeCall("call-b");
            router.register(callA);
            router.register(callB);
            const aCb = vi.fn();
            const bCb = vi.fn();
            callA.on("ringing", aCb);
            callB.on("ringing", bCb);

            emitSocket(socket, "call:ringing", "call-a");

            expect(aCb).toHaveBeenCalledOnce();
            expect(bCb).not.toHaveBeenCalled();
        });
    });

    describe("auto-unregister on terminal", () => {
        it.each([
            ["call:ended", "ENDED"],
            ["call:rejected", "REJECTED"],
            ["call:unanswered", "NOT_ANSWERED"],
        ])("%s removes the Call from the routing table", (event) => {
            const socket = makeMockSocket();
            const router = new CallRouter(socket as unknown as DeviceSocket);
            router.start();
            const call = makeCall();
            router.register(call);

            emitSocket(socket, event, call.id);

            expect(router.has(call.id)).toBe(false);
        });

        it("call:failed removes the Call and forwards the error payload", () => {
            const socket = makeMockSocket();
            const router = new CallRouter(socket as unknown as DeviceSocket);
            router.start();
            const call = makeCall();
            router.register(call);
            const cb = vi.fn();
            call.on("failed", cb);

            emitSocket(socket, "call:failed", call.id, "boom");

            expect(cb).toHaveBeenCalledWith("boom");
            expect(router.has(call.id)).toBe(false);
        });
    });

    describe("register / unregister", () => {
        it("returned Unsubscribe removes the Call from routing", () => {
            const socket = makeMockSocket();
            const router = new CallRouter(socket as unknown as DeviceSocket);
            router.start();
            const call = makeCall();
            const unregister = router.register(call);
            const cb = vi.fn();
            call.on("ringing", cb);

            unregister();
            emitSocket(socket, "call:ringing", call.id);

            expect(cb).not.toHaveBeenCalled();
        });
    });

    describe("stop()", () => {
        it("removes all socket listeners and clears the routing table", () => {
            const socket = makeMockSocket();
            const router = new CallRouter(socket as unknown as DeviceSocket);
            router.start();
            const call = makeCall();
            router.register(call);
            const cb = vi.fn();
            call.on("ringing", cb);

            router.stop();
            emitSocket(socket, "call:ringing", call.id);

            expect(cb).not.toHaveBeenCalled();
            expect(router.has(call.id)).toBe(false);
        });

        it("listener count is N for one start, 0 after stop", () => {
            const socket = makeMockSocket();
            const router = new CallRouter(socket as unknown as DeviceSocket);

            router.start();
            const live = getListenerCount(socket, "call:ringing");
            router.stop();
            const dead = getListenerCount(socket, "call:ringing");

            expect(live).toBe(1);
            expect(dead).toBe(0);
        });
    });

    describe("scalability — single subscription regardless of registered count", () => {
        it("100 registered Calls do not multiply socket listener count", () => {
            const socket = makeMockSocket();
            const router = new CallRouter(socket as unknown as DeviceSocket);
            router.start();
            const baseline = getListenerCount(socket, "call:ringing");

            for (let i = 0; i < 100; i++) {
                router.register(makeCall(`call-${i}`));
            }

            expect(getListenerCount(socket, "call:ringing")).toBe(baseline);
        });
    });

    describe("payload integrity for stats", () => {
        it("statsChanged-equivalent CallStats round-trip through the router untouched", () => {
            const socket = makeMockSocket();
            const router = new CallRouter(socket as unknown as DeviceSocket);
            router.start();
            const call = makeCall();
            router.register(call);
            const cb = vi.fn();
            call.on("serverStats", cb);

            const stats: ServerCallStats = {
                rtt: { client: { min: 0, max: 0, avg: 0 }, whatsapp: { min: 0, max: 0, avg: 0 } },
                tx: { total: 0, total_bytes: 0, loss: 0 },
                rx: { total: 0, total_bytes: 0, loss: 0 },
            };
            emitSocket(socket, "call:stats", call.id, stats);

            const received = cb.mock.calls[0]?.[0] as CallStats;
            expect(received).toBe(stats);
        });
    });
});
