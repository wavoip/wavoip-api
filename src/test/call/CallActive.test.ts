import { CallActiveProxy } from "@/modules/call/CallActive";
import { CallBus } from "@/modules/call/CallBus";
import type { CallStats, ServerCallStats } from "@/modules/call/Stats";
import { Call } from "@/modules/device/Call";
import type { ITransport, Events as TransportEvents } from "@/modules/media/ITransport";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import { describe, expect, it, vi } from "vitest";

const peer = { phone: "5511999999999", displayName: "Test", profilePicture: null };

function makeCall() {
    const call = Call.CreateOffer("call-1", "OFFICIAL", peer, "device-token");
    call.accept(); // move to ACTIVE
    return call;
}

function makeMockBus(call: Call) {
    const socket = new EventEmitter<Record<string, unknown[]>>() as never;
    return new CallBus(call, socket);
}

function makeMockTransport(overrides: Partial<ITransport> = {}): ITransport {
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
    return Object.assign(t, overrides);
}

function makeMockMediaManager() {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    const on = vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        const arr = listeners.get(event) ?? [];
        arr.push(cb);
        listeners.set(event, arr);
        return () => listeners.set(event, (listeners.get(event) ?? []).filter((l) => l !== cb));
    });
    const emit = (event: string, ...args: unknown[]) => {
        for (const cb of listeners.get(event) ?? []) cb(...args);
    };

    return {
        setMuted: vi.fn(),
        startMedia: vi.fn(),
        stopMedia: vi.fn(),
        setMicrophone: vi.fn().mockResolvedValue(true),
        on,
        audioContext: {} as AudioContext,
        _emit: emit,
    };
}

describe("CallActive", () => {
    describe("getters", () => {
        it("id, type, direction, device_token, status proxy to call", () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, bus, transport, mm as never, { onEnd: vi.fn() });

            expect(active.id).toBe("call-1");
            expect(active.type).toBe("OFFICIAL");
            expect(active.direction).toBe("INCOMING");
            expect(active.device_token).toBe("device-token");
            expect(active.status).toBe("ACTIVE");
        });

        it("peer.muted reflects transport.peerMuted", () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const transport = makeMockTransport({ peerMuted: true } as Partial<ITransport>);
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, bus, transport, mm as never, { onEnd: vi.fn() });

            expect(active.peer.muted).toBe(true);
        });

        it("connection_status reads transport.status", () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const transport = makeMockTransport({ status: "connected" } as Partial<ITransport>);
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, bus, transport, mm as never, { onEnd: vi.fn() });

            expect(active.connection_status).toBe("connected");
        });

        it("audio_analyser reads transport.audioAnalyser", async () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const mockAnalyser = {} as AnalyserNode;
            const transport = makeMockTransport({
                audioAnalyser: Promise.resolve(mockAnalyser),
            } as Partial<ITransport>);
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, bus, transport, mm as never, { onEnd: vi.fn() });

            await expect(active.audio_analyser).resolves.toBe(mockAnalyser);
        });
    });

    describe("mute()", () => {
        it("calls mediaManager.setMuted(true) and returns { err: null }", async () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, bus, transport, mm as never, { onEnd: vi.fn() });

            const result = await active.mute();

            expect(mm.setMuted).toHaveBeenCalledWith(true);
            expect(result).toEqual({ err: null });
        });
    });

    describe("unmute()", () => {
        it("calls mediaManager.setMuted(false) and returns { err: null }", async () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, bus, transport, mm as never, { onEnd: vi.fn() });

            const result = await active.unmute();

            expect(mm.setMuted).toHaveBeenCalledWith(false);
            expect(result).toEqual({ err: null });
        });
    });

    describe("end()", () => {
        it("calls callbacks.onEnd(call), transport.stop(), and returns { err: null }", async () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const onEnd = vi.fn();
            const active = CallActiveProxy(call, bus, transport, mm as never, { onEnd });

            const result = await active.end();

            expect(onEnd).toHaveBeenCalledWith(call);
            expect(transport.stop).toHaveBeenCalledOnce();
            expect(result).toEqual({ err: null });
        });
    });

    describe("event subscriptions", () => {
        it("onPeerMute fires only when bus emits peerMuted(true)", () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, bus, transport, mm as never, { onEnd: vi.fn() });
            const cb = vi.fn();
            active.onPeerMute(cb);

            bus.emit("peerMuted", false);
            expect(cb).not.toHaveBeenCalled();

            bus.emit("peerMuted", true);
            expect(cb).toHaveBeenCalledOnce();
        });

        it("onPeerUnmute fires only when bus emits peerMuted(false)", () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, bus, transport, mm as never, { onEnd: vi.fn() });
            const cb = vi.fn();
            active.onPeerUnmute(cb);

            bus.emit("peerMuted", true);
            expect(cb).not.toHaveBeenCalled();

            bus.emit("peerMuted", false);
            expect(cb).toHaveBeenCalledOnce();
        });

        it("onEnd fires when bus emits 'ended'", () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, bus, transport, mm as never, { onEnd: vi.fn() });
            const cb = vi.fn();
            active.onEnd(cb);

            bus.emit("ended");

            expect(cb).toHaveBeenCalledOnce();
        });

        it("onStats fires with stats when bus emits 'stats'", () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, bus, transport, mm as never, { onEnd: vi.fn() });
            const cb = vi.fn();
            active.onStats(cb);

            const stats: CallStats = {
                rtt: { min: 1, max: 5, avg: 3 },
                tx: { total: 100, total_bytes: 5000, loss: 2 },
                rx: { total: 98, total_bytes: 4900, loss: 1 },
            };
            bus.emit("stats", stats);

            expect(cb).toHaveBeenCalledWith(stats);
        });

        it("on('serverStats') fires when bus emits 'serverStats'", () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, bus, transport, mm as never, { onEnd: vi.fn() });
            const cb = vi.fn();
            active.on("serverStats", cb);

            const stats: ServerCallStats = {
                rtt: {
                    client: { min: 10, max: 30, avg: 20 },
                    whatsapp: { min: 5, max: 15, avg: 9 },
                },
                tx: { total: 100, total_bytes: 5000, loss: 2 },
                rx: { total: 98, total_bytes: 4900, loss: 1 },
            };
            bus.emit("serverStats", stats);

            expect(cb).toHaveBeenCalledWith(stats);
        });

        it("onConnectionStatus fires when bus emits 'connectionStatus'", () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, bus, transport, mm as never, { onEnd: vi.fn() });
            const cb = vi.fn();
            active.onConnectionStatus(cb);

            bus.emit("connectionStatus", "connected");

            expect(cb).toHaveBeenCalledWith("connected");
        });

        it("onStatus fires when bus emits 'status'", () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, bus, transport, mm as never, { onEnd: vi.fn() });
            const cb = vi.fn();
            active.onStatus(cb);

            bus.emit("status", "ENDED");

            expect(cb).toHaveBeenCalledWith("ENDED");
        });

        it("on('micChanged') fires with device when mediaManager emits micChanged", () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, bus, transport, mm as never, { onEnd: vi.fn() });
            const cb = vi.fn();
            active.on("micChanged", cb);

            const device = { deviceId: "mic-2", kind: "audioinput" } as MediaDeviceInfo;
            const track = { kind: "audio" } as MediaStreamTrack;
            mm._emit("micChanged", device, track);

            expect(cb).toHaveBeenCalledWith(device);
        });
    });

    describe("setMicrophone()", () => {
        it("delegates to mediaManager.setMicrophone and returns { err: null } on success", async () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, bus, transport, mm as never, { onEnd: vi.fn() });

            const result = await active.setMicrophone("mic-2");

            expect(mm.setMicrophone).toHaveBeenCalledWith("mic-2");
            expect(result).toEqual({ err: null });
        });

        it("returns { err } when mediaManager.setMicrophone returns false (unknown device)", async () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            mm.setMicrophone.mockResolvedValueOnce(false);
            const active = CallActiveProxy(call, bus, transport, mm as never, { onEnd: vi.fn() });

            const result = await active.setMicrophone("mic-unknown");

            expect(result.err).toMatch(/not found/);
        });

        it("returns { err } when mediaManager.setMicrophone throws", async () => {
            const call = makeCall();
            const bus = makeMockBus(call);
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            mm.setMicrophone.mockRejectedValueOnce(new Error("permission denied"));
            const active = CallActiveProxy(call, bus, transport, mm as never, { onEnd: vi.fn() });

            const result = await active.setMicrophone("mic-2");

            expect(result.err).toBe("permission denied");
        });
    });
});
