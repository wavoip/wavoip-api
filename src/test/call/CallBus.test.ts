import { CallBus } from "@/modules/call/CallBus";
import type { CallStats } from "@/modules/call/Stats";
import { Call } from "@/modules/device/Call";
import type { ServerEvents } from "@/modules/device/WebSocket";
import type { ITransport, Events as TransportEvents } from "@/modules/media/ITransport";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import { describe, expect, it, vi } from "vitest";

const peer = { phone: "5511999999999", displayName: null, profilePicture: null };

function makeCall(id = "call-1") {
    return Call.CreateOffer(id, "official", peer, "device-token");
}

function makeMockSocket() {
    return new EventEmitter<Record<string, unknown[]>>() as never;
}

function makeMockTransport(): ITransport {
    const t = new EventEmitter<TransportEvents>() as unknown as ITransport;
    t.status = "disconnected";
    t.peerMuted = false;
    t.audioAnalyser = Promise.resolve({} as AnalyserNode);
    t.stats = {
        rtt: { min: 0, max: 0, avg: 0 },
        tx: { total: 0, total_bytes: 0, loss: 0 },
        rx: { total: 0, total_bytes: 0, loss: 0 },
    };
    t.start = vi.fn().mockResolvedValue(undefined);
    t.stop = vi.fn().mockResolvedValue(undefined);
    return t;
}

const emitSocket = (socket: ReturnType<typeof makeMockSocket>, event: keyof ServerEvents, ...args: unknown[]) => {
    (socket as unknown as EventEmitter<Record<string, unknown[]>>).emit(
        event as string,
        ...((args as unknown[][])[0] !== undefined ? args : []),
    );
};

describe("CallBus", () => {
    describe("socket event routing", () => {
        it("emits 'status' when call:status fires for matching call id", () => {
            const call = makeCall();
            const socket = makeMockSocket();
            const bus = new CallBus(call, socket as never);
            const cb = vi.fn();
            bus.on("status", cb);

            (socket as unknown as EventEmitter<Record<string, unknown[]>>).emit("call:status", call.id, "ACTIVE");

            expect(cb).toHaveBeenCalledWith("ACTIVE");
        });

        it("ignores call:status for different call id", () => {
            const call = makeCall("call-1");
            const socket = makeMockSocket();
            const bus = new CallBus(call, socket as never);
            const cb = vi.fn();
            bus.on("status", cb);

            (socket as unknown as EventEmitter<Record<string, unknown[]>>).emit("call:status", "other-call", "ACTIVE");

            expect(cb).not.toHaveBeenCalled();
        });

        it("call:status with NOT_ANSWERED also emits 'unanswered'", () => {
            const call = makeCall();
            const socket = makeMockSocket();
            const bus = new CallBus(call, socket as never);
            const statusCb = vi.fn();
            const unansweredCb = vi.fn();
            bus.on("status", statusCb);
            bus.on("unanswered", unansweredCb);

            (socket as unknown as EventEmitter<Record<string, unknown[]>>).emit("call:status", call.id, "NOT_ANSWERED");

            expect(statusCb).toHaveBeenCalledWith("NOT_ANSWERED");
            expect(unansweredCb).toHaveBeenCalledOnce();
        });

        it("call:ended emits 'ended'", () => {
            const call = makeCall();
            const socket = makeMockSocket();
            const bus = new CallBus(call, socket as never);
            const cb = vi.fn();
            bus.on("ended", cb);

            (socket as unknown as EventEmitter<Record<string, unknown[]>>).emit("call:ended", call.id);

            expect(cb).toHaveBeenCalledOnce();
        });

        it("ignores call:ended for different call id", () => {
            const call = makeCall("call-1");
            const socket = makeMockSocket();
            const bus = new CallBus(call, socket as never);
            const cb = vi.fn();
            bus.on("ended", cb);

            (socket as unknown as EventEmitter<Record<string, unknown[]>>).emit("call:ended", "other-call");

            expect(cb).not.toHaveBeenCalled();
        });

        it("call:accepted emits 'accepted'", () => {
            const call = makeCall();
            const socket = makeMockSocket();
            const bus = new CallBus(call, socket as never);
            const cb = vi.fn();
            bus.on("accepted", cb);

            (socket as unknown as EventEmitter<Record<string, unknown[]>>).emit("call:accepted", call.id);

            expect(cb).toHaveBeenCalledOnce();
        });

        it("ignores call:accepted for different call id", () => {
            const call = makeCall("call-1");
            const socket = makeMockSocket();
            const bus = new CallBus(call, socket as never);
            const cb = vi.fn();
            bus.on("accepted", cb);

            (socket as unknown as EventEmitter<Record<string, unknown[]>>).emit("call:accepted", "other-call");

            expect(cb).not.toHaveBeenCalled();
        });

        it("call:rejected emits 'rejected'", () => {
            const call = makeCall();
            const socket = makeMockSocket();
            const bus = new CallBus(call, socket as never);
            const cb = vi.fn();
            bus.on("rejected", cb);

            (socket as unknown as EventEmitter<Record<string, unknown[]>>).emit("call:rejected", call.id);

            expect(cb).toHaveBeenCalledOnce();
        });

        it("ignores call:rejected for different call id", () => {
            const call = makeCall("call-1");
            const socket = makeMockSocket();
            const bus = new CallBus(call, socket as never);
            const cb = vi.fn();
            bus.on("rejected", cb);

            (socket as unknown as EventEmitter<Record<string, unknown[]>>).emit("call:rejected", "other-call");

            expect(cb).not.toHaveBeenCalled();
        });
    });

    describe("wireTransport()", () => {
        it("transport statusChanged 'connected' → bus emits connectionStatus 'connected'", () => {
            const call = makeCall();
            const socket = makeMockSocket();
            const bus = new CallBus(call, socket as never);
            const transport = makeMockTransport();
            const cb = vi.fn();
            bus.on("connectionStatus", cb);

            bus.wireTransport(transport);
            (transport as unknown as EventEmitter<TransportEvents>).emit("statusChanged", "connected");

            expect(cb).toHaveBeenCalledWith("connected");
        });

        it("transport statusChanged 'reconnecting' → bus emits connectionStatus 'reconnecting' but NOT 'ended'", () => {
            const call = makeCall();
            const socket = makeMockSocket();
            const bus = new CallBus(call, socket as never);
            const transport = makeMockTransport();
            const connectionStatusCb = vi.fn();
            const endedCb = vi.fn();
            bus.on("connectionStatus", connectionStatusCb);
            bus.on("ended", endedCb);

            bus.wireTransport(transport);
            (transport as unknown as EventEmitter<TransportEvents>).emit("statusChanged", "reconnecting");

            expect(connectionStatusCb).toHaveBeenCalledWith("reconnecting");
            expect(endedCb).not.toHaveBeenCalled();
        });

        it("transport statusChanged 'disconnected' → bus emits connectionStatus AND 'ended'", () => {
            const call = makeCall();
            const socket = makeMockSocket();
            const bus = new CallBus(call, socket as never);
            const transport = makeMockTransport();
            const connectionStatusCb = vi.fn();
            const endedCb = vi.fn();
            bus.on("connectionStatus", connectionStatusCb);
            bus.on("ended", endedCb);

            bus.wireTransport(transport);
            (transport as unknown as EventEmitter<TransportEvents>).emit("statusChanged", "disconnected");

            expect(connectionStatusCb).toHaveBeenCalledWith("disconnected");
            expect(endedCb).toHaveBeenCalledOnce();
        });

        it("transport peerMuted → bus emits peerMuted", () => {
            const call = makeCall();
            const socket = makeMockSocket();
            const bus = new CallBus(call, socket as never);
            const transport = makeMockTransport();
            const cb = vi.fn();
            bus.on("peerMuted", cb);

            bus.wireTransport(transport);
            (transport as unknown as EventEmitter<TransportEvents>).emit("peerMuted", true);

            expect(cb).toHaveBeenCalledWith(true);
        });

        it("transport statsChanged → bus emits stats", () => {
            const call = makeCall();
            const socket = makeMockSocket();
            const bus = new CallBus(call, socket as never);
            const transport = makeMockTransport();
            const cb = vi.fn();
            bus.on("stats", cb);

            const stats: CallStats = {
                rtt: { min: 1, max: 5, avg: 3 },
                tx: { total: 100, total_bytes: 5000, loss: 2 },
                rx: { total: 98, total_bytes: 4900, loss: 1 },
            };

            bus.wireTransport(transport);
            (transport as unknown as EventEmitter<TransportEvents>).emit("statsChanged", stats);

            expect(cb).toHaveBeenCalledWith(stats);
        });
    });
});
