import { CallActiveProxy } from "@/modules/call/CallActive";
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

function makeMockTransport(overrides: Partial<ITransport> = {}): ITransport {
    const t = new EventEmitter<TransportEvents>() as unknown as ITransport;
    t.status = "disconnected";
    t.peerMuted = false;
    t.audioAnalyserIn = Promise.resolve({} as AnalyserNode);
    t.audioAnalyserOut = Promise.resolve({} as AnalyserNode);
    t.stats = {
        rtt: { min: 0, max: 0, avg: 0 },
        tx: { total: 0, total_bytes: 0, loss: 0, bitrate_kbps: 0, audio_level: 0 },
        rx: { total: 0, total_bytes: 0, loss: 0, bitrate_kbps: 0, audio_level: 0, jitter_ms: 0 },
        audio_context: { output_latency_ms: 0 },
    };
    t.start = vi.fn().mockResolvedValue(undefined);
    t.stop = vi.fn().mockResolvedValue(undefined);
    return Object.assign(t, overrides);
}

function makeMockMediaManager() {
    return {
        setMuted: vi.fn(),
        startMedia: vi.fn(),
        stopMedia: vi.fn(),
        audioContext: {} as AudioContext,
    };
}

describe("CallActive", () => {
    describe("getters", () => {
        it("id, type, direction, deviceToken, status proxy to call", () => {
            const call = makeCall();

            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });

            expect(active.id).toBe("call-1");
            expect(active.type).toBe("OFFICIAL");
            expect(active.direction).toBe("INCOMING");
            expect(active.deviceToken).toBe("device-token");
            expect(active.status).toBe("ACTIVE");
        });

        it("peer.muted reflects transport.peerMuted", () => {
            const call = makeCall();
            
            const transport = makeMockTransport({ peerMuted: true } as Partial<ITransport>);
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });

            expect(active.peer.muted).toBe(true);
        });

        it("connectionStatus reads transport.status", () => {
            const call = makeCall();

            const transport = makeMockTransport({ status: "connected" } as Partial<ITransport>);
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });

            expect(active.connectionStatus).toBe("connected");
        });

        it("status reflects later mutations of call.status", () => {
            const call = makeCall();
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });

            expect(active.status).toBe("ACTIVE");
            call.status = "ENDED";
            expect(active.status).toBe("ENDED");
        });

        it("connectionStatus reflects later mutations of transport.status", () => {
            const call = makeCall();
            const transport = makeMockTransport({ status: "connecting" } as Partial<ITransport>);
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });

            expect(active.connectionStatus).toBe("connecting");
            transport.status = "connected";
            expect(active.connectionStatus).toBe("connected");
        });

        it("peer.muted reflects later mutations of transport.peerMuted", () => {
            const call = makeCall();
            const transport = makeMockTransport({ peerMuted: false } as Partial<ITransport>);
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });

            expect(active.peer.muted).toBe(false);
            transport.peerMuted = true;
            expect(active.peer.muted).toBe(true);
        });

        it("audioAnalyserIn reads transport.audioAnalyserIn", async () => {
            const call = makeCall();

            const mockAnalyser = {} as AnalyserNode;
            const transport = makeMockTransport({
                audioAnalyserIn: Promise.resolve(mockAnalyser),
            } as Partial<ITransport>);
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });

            await expect(active.audioAnalyserIn).resolves.toBe(mockAnalyser);
        });

        it("audioAnalyserOut reads transport.audioAnalyserOut", async () => {
            const call = makeCall();

            const mockAnalyser = {} as AnalyserNode;
            const transport = makeMockTransport({
                audioAnalyserOut: Promise.resolve(mockAnalyser),
            } as Partial<ITransport>);
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });

            await expect(active.audioAnalyserOut).resolves.toBe(mockAnalyser);
        });
    });

    describe("deprecated snake-case getters", () => {
        it("device_token warns once then forwards to call.deviceToken", async () => {
            const { _resetDeprecationWarnings } = await import("@/modules/shared/deprecation");
            _resetDeprecationWarnings();
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

            const call = makeCall();
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });

            expect(active.device_token).toBe("device-token");
            expect(active.device_token).toBe("device-token");

            const matches = warn.mock.calls.filter((c) => String(c[0]).includes("CallActive.device_token"));
            expect(matches).toHaveLength(1);
            warn.mockRestore();
        });

        it("connection_status warns once then reads transport.status", async () => {
            const { _resetDeprecationWarnings } = await import("@/modules/shared/deprecation");
            _resetDeprecationWarnings();
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

            const call = makeCall();
            const transport = makeMockTransport({ status: "connected" } as Partial<ITransport>);
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });

            expect(active.connection_status).toBe("connected");
            expect(active.connection_status).toBe("connected");

            const matches = warn.mock.calls.filter((c) => String(c[0]).includes("CallActive.connection_status"));
            expect(matches).toHaveLength(1);
            warn.mockRestore();
        });

        it("audio_analyser warns once then forwards to transport.audioAnalyserIn", async () => {
            const { _resetDeprecationWarnings } = await import("@/modules/shared/deprecation");
            _resetDeprecationWarnings();
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

            const call = makeCall();
            const mockAnalyser = {} as AnalyserNode;
            const transport = makeMockTransport({
                audioAnalyserIn: Promise.resolve(mockAnalyser),
            } as Partial<ITransport>);
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });

            await expect(active.audio_analyser).resolves.toBe(mockAnalyser);
            await expect(active.audio_analyser).resolves.toBe(mockAnalyser);

            const matches = warn.mock.calls.filter((c) => String(c[0]).includes("CallActive.audio_analyser"));
            expect(matches).toHaveLength(1);
            warn.mockRestore();
        });
    });

    describe("mute()", () => {
        it("calls mediaManager.setMuted(true) and returns { err: null }", async () => {
            const call = makeCall();
            
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });

            const result = await active.mute();

            expect(mm.setMuted).toHaveBeenCalledWith(true);
            expect(result).toEqual({ err: null });
        });
    });

    describe("unmute()", () => {
        it("calls mediaManager.setMuted(false) and returns { err: null }", async () => {
            const call = makeCall();
            
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });

            const result = await active.unmute();

            expect(mm.setMuted).toHaveBeenCalledWith(false);
            expect(result).toEqual({ err: null });
        });
    });

    describe("end()", () => {
        it("calls callbacks.onEnd(call), transport.stop(), and returns { err: null }", async () => {
            const call = makeCall();
            
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const onEnd = vi.fn();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd });

            const result = await active.end();

            expect(onEnd).toHaveBeenCalledWith(call);
            expect(transport.stop).toHaveBeenCalledOnce();
            expect(result).toEqual({ err: null });
        });

        it("is idempotent — calling end() twice still stops transport once", async () => {
            const call = makeCall();
            
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });

            await active.end();
            await active.end();

            expect(transport.stop).toHaveBeenCalledOnce();
        });
    });

    describe("terminal cleanup (mic release)", () => {
        it("bus 'ended' calls transport.stop()", () => {
            const call = makeCall();
            
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });

            call.emit("ended");

            expect(transport.stop).toHaveBeenCalledOnce();
        });

        it("bus 'failed' calls transport.stop()", () => {
            const call = makeCall();
            
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });

            call.emit("failed", "boom");

            expect(transport.stop).toHaveBeenCalledOnce();
        });

        it("local end() then bus 'ended' still stops transport once", async () => {
            const call = makeCall();
            
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });

            await active.end();
            call.emit("ended");

            expect(transport.stop).toHaveBeenCalledOnce();
        });

        it("ended consumer event still fires after dispose", () => {
            const call = makeCall();
            
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });
            const cb = vi.fn();
            active.on("ended", cb);

            call.emit("ended");

            expect(cb).toHaveBeenCalledOnce();
            expect(transport.stop).toHaveBeenCalledOnce();
        });
    });

    describe("event subscriptions", () => {
        it("onPeerMute fires only when bus emits peerMuted(true)", () => {
            const call = makeCall();
            
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });
            const cb = vi.fn();
            active.onPeerMute(cb);

            call.emit("peerMuted", false);
            expect(cb).not.toHaveBeenCalled();

            call.emit("peerMuted", true);
            expect(cb).toHaveBeenCalledOnce();
        });

        it("onPeerUnmute fires only when bus emits peerMuted(false)", () => {
            const call = makeCall();
            
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });
            const cb = vi.fn();
            active.onPeerUnmute(cb);

            call.emit("peerMuted", true);
            expect(cb).not.toHaveBeenCalled();

            call.emit("peerMuted", false);
            expect(cb).toHaveBeenCalledOnce();
        });

        it("onEnd fires when bus emits 'ended'", () => {
            const call = makeCall();
            
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });
            const cb = vi.fn();
            active.onEnd(cb);

            call.emit("ended");

            expect(cb).toHaveBeenCalledOnce();
        });

        it("onStats fires with stats when bus emits 'stats'", () => {
            const call = makeCall();
            
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });
            const cb = vi.fn();
            active.onStats(cb);

            const stats: CallStats = {
                rtt: { min: 1, max: 5, avg: 3 },
                tx: { total: 100, total_bytes: 5000, loss: 2, bitrate_kbps: 0, audio_level: 0 },
                rx: { total: 98, total_bytes: 4900, loss: 1, bitrate_kbps: 0, audio_level: 0, jitter_ms: 0 },
                audio_context: { output_latency_ms: 0 },
            };
            call.emit("stats", stats);

            expect(cb).toHaveBeenCalledWith(stats);
        });

        it("on('serverStats') fires when bus emits 'serverStats'", () => {
            const call = makeCall();
            
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });
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
            call.emit("serverStats", stats);

            expect(cb).toHaveBeenCalledWith(stats);
        });

        it("onConnectionStatus fires when bus emits 'connectionStatus'", () => {
            const call = makeCall();
            
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });
            const cb = vi.fn();
            active.onConnectionStatus(cb);

            call.emit("connectionStatus", "connected");

            expect(cb).toHaveBeenCalledWith("connected");
        });

        it("onStatus fires when bus emits 'status'", () => {
            const call = makeCall();
            
            const transport = makeMockTransport();
            const mm = makeMockMediaManager();
            const active = CallActiveProxy(call, transport, mm as never, { onEnd: vi.fn() });
            const cb = vi.fn();
            active.onStatus(cb);

            call.emit("status", "ENDED");

            expect(cb).toHaveBeenCalledWith("ENDED");
        });
    });
});
