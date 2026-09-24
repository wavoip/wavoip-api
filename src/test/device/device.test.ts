import { describe, expect, it, vi } from "vitest";

const { makeSocket, getSocket } = vi.hoisted(() => {
    type SocketListener = (...args: unknown[]) => void;
    let _last: ReturnType<typeof _make> | null = null;

    function _make() {
        const listeners = new Map<string, SocketListener[]>();
        const s = {
            connected: false,
            disconnected: true,
            active: false,
            connect: vi.fn(),
            disconnect: vi.fn(),
            emit: vi.fn() as ReturnType<typeof vi.fn>,
            // Respostas dos comandos com ack (call.start, call.cancel, call.mute).
            ackResponse: { type: "success" } as unknown,
            withAck: [] as { event: string; args: unknown[] }[],
            timeout(_ms: number) {
                return {
                    emitWithAck: async (event: string, ...args: unknown[]) => {
                        this.withAck.push({ event, args });
                        return this.ackResponse;
                    },
                };
            },
            on(event: string, cb: SocketListener) {
                if (!listeners.has(event)) listeners.set(event, []);
                listeners.get(event)?.push(cb);
                return this;
            },
            off(event: string, cb: SocketListener) {
                const arr = listeners.get(event);
                if (!arr) return this;
                listeners.set(
                    event,
                    arr.filter((fn) => fn !== cb),
                );
                return this;
            },
            receive(event: string, ...args: unknown[]) {
                for (const cb of listeners.get(event) ?? []) cb(...args);
            },
            listenerCount(event: string): number {
                return listeners.get(event)?.length ?? 0;
            },
        };
        _last = s;
        return s;
    }

    return { makeSocket: _make, getSocket: () => _last ?? _make() };
});

vi.mock("@/adapters/socketio/DeviceSocket", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/adapters/socketio/DeviceSocket")>();
    return { ...actual, DeviceWebSocketFactory: vi.fn(makeSocket) };
});

vi.mock("@/adapters/http/FetchDeviceApi", () => ({
    FetchDeviceApi: class {
        restart = vi.fn().mockResolvedValue({ data: undefined, error: null });
        logout = vi.fn().mockResolvedValue({ data: undefined, error: null });
        wakeUp = vi.fn().mockResolvedValue({ data: undefined, error: null });
    },
}));

vi.mock("@/modules/media/webrtc/Transport", () => ({
    WebRTCTransport: class {
        kind = "webrtc" as const;
        status = "connected" as const;
        peerMuted = false;
        lastDiagnostics = null;
        emittedConnectivityIssues = new Set();
        meterIn = Promise.resolve({});
        meterOut = Promise.resolve({});
        createOffer = vi.fn().mockResolvedValue("v=0\r\nfake-offer-sdp");
        accept = vi.fn().mockResolvedValue({ type: "webRTC", sdp: "v=0\r\nfake-answer-sdp" });
        connect = vi.fn().mockResolvedValue(undefined);
        stop = vi.fn().mockResolvedValue(undefined);
        getStats = vi.fn().mockResolvedValue({});
        on = vi.fn();
        emit = vi.fn();
        off = vi.fn();
    },
}));

import type { Device } from "@/domain/device/contract";
import { Wavoip } from "@/Wavoip";
import type { WavoipRuntime } from "@/ports/WavoipRuntime";
import { FakeAudioRuntime } from "@/test/fakes/FakeAudioRuntime";
import type { CallType } from "@/domain/call/types";
import type { CallSession } from "@/application/call/CallSession";
import type { DeviceSession } from "@/application/device/DeviceSession";
import { IncomingCallProxy } from "@/modules/call/IncomingCall";

const peer = { phone: "5511999999999", displayName: "Test", profilePicture: null };

function makeDeviceConnection() {
    // O transporte é mockado neste arquivo, então nada aqui chega a tocar no runtime.
    const wavoip = new Wavoip({ tokens: ["test-token"], runtime: new FakeAudioRuntime() as unknown as WavoipRuntime });
    const dc = wavoip.devices[0] as DeviceSession;
    const socket = getSocket();
    return { dc, socket };
}

// A tabela de chamadas roteadas vive no CallRegistry da sessão do device.
function callsMap(session: DeviceSession): Map<string, unknown> {
    return (session as unknown as { registry: { routed: Map<string, unknown> } }).registry.routed;
}

const offerProps = (id: string) => ({
    id,
    peer,
    offer: { type: "webRTC" as const, sdp: "v=0\r\n..." },
});

describe("DeviceConnection — manual disconnect", () => {
    it("does not auto-reconnect after manual disconnect()", async () => {
        vi.useFakeTimers();
        const { dc, socket } = makeDeviceConnection();
        socket.disconnected = false;
        socket.connect.mockClear();

        dc.disconnect();
        expect(socket.disconnect).toHaveBeenCalledTimes(1);

        socket.receive("disconnect");
        await vi.advanceTimersByTimeAsync(5000);

        expect(socket.connect).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it("closes the socket even while still connecting", () => {
        // O socket.io diz `disconnected: true` até o handshake terminar. O disconnect() tem
        // que fechar mesmo assim, senão a conexão em andamento sobrevive como socket órfão
        // (sair da página do device no meio da conexão).
        const { dc, socket } = makeDeviceConnection();
        socket.connected = false;
        socket.disconnected = true;

        dc.disconnect();

        expect(socket.disconnect).toHaveBeenCalledTimes(1);
    });
});

describe("DeviceConnection — connectionStatusChanged on socket disconnect/reconnect", () => {
    it("emits connectionStatusChanged('disconnected') when the socket fires 'disconnect'", () => {
        const { dc, socket } = makeDeviceConnection();
        socket.receive("device:init", "open", "UNOFFICIAL", { phone: "5511" }, null, false);
        const cb = vi.fn();
        dc.on("connectionStatusChanged", cb);

        socket.receive("disconnect");

        expect(cb.mock.calls[0]?.[0]).toBe("disconnected");
    });

    it("emits connectionStatusChanged('reconnecting') after starting reconnect attempts", async () => {
        vi.useFakeTimers();
        const { dc, socket } = makeDeviceConnection();
        socket.receive("device:init", "open", "UNOFFICIAL", { phone: "5511" }, null, false);
        const cb = vi.fn();
        dc.on("connectionStatusChanged", cb);

        socket.receive("disconnect");
        await vi.advanceTimersByTimeAsync(0);

        const calls = cb.mock.calls.map((c) => c[0]);
        expect(calls).toContain("disconnected");
        expect(calls).toContain("reconnecting");
        vi.useRealTimers();
    });

    it("emits connectionStatusChanged('connected') on device:init", () => {
        const { dc, socket } = makeDeviceConnection();
        const cb = vi.fn();
        dc.on("connectionStatusChanged", cb);

        socket.receive("device:init", "open", "UNOFFICIAL", null, null, false);

        expect(cb).toHaveBeenCalledWith("connected");
        expect(dc.connectionStatus).toBe("connected");
    });

    it("does not mutate device.status on socket disconnect", () => {
        const { dc, socket } = makeDeviceConnection();
        socket.receive("device:init", "open", "UNOFFICIAL", { phone: "5511" }, null, false);

        socket.receive("disconnect");

        expect(dc.status).toBe("open");
    });
});

describe("DeviceConnection — calls map cleanup", () => {
    describe("official incoming call", () => {
        it("adds call to map when offer arrives", () => {
            const { dc, socket } = makeDeviceConnection();

            socket.receive("call:offer", offerProps("call-1"), vi.fn());

            expect(callsMap(dc).has("call-1")).toBe(true);
        });

        it("removes call from map when remote hangs up (call:ended)", () => {
            const { dc, socket } = makeDeviceConnection();

            socket.receive("call:offer", offerProps("call-1"), vi.fn());
            expect(callsMap(dc).has("call-1")).toBe(true);

            socket.receive("call:ended", "call-1");

            expect(callsMap(dc).has("call-1")).toBe(false);
        });

        it("ignores call:ended for a different call id", () => {
            const { dc, socket } = makeDeviceConnection();

            socket.receive("call:offer", offerProps("call-1"), vi.fn());
            socket.receive("call:ended", "other-call");

            expect(callsMap(dc).has("call-1")).toBe(true);
        });

        it("removes call from map on timeout (call:unanswered)", () => {
            const { dc, socket } = makeDeviceConnection();

            socket.receive("call:offer", offerProps("call-1"), vi.fn());
            expect(callsMap(dc).has("call-1")).toBe(true);

            socket.receive("call:unanswered", "call-1");

            expect(callsMap(dc).has("call-1")).toBe(false);
        });

        it("removes call from map when consumer rejects the offer", async () => {
            const { dc, socket } = makeDeviceConnection();
            const received: CallSession[] = [];
            dc.on("incomingCall", (call) => received.push(call));

            socket.receive("call:offer", offerProps("call-1"), vi.fn());
            expect(callsMap(dc).has("call-1")).toBe(true);
            expect(received).toHaveLength(1);

            await IncomingCallProxy(received[0]).reject();

            expect(callsMap(dc).has("call-1")).toBe(false);
        });

        it("handles multiple concurrent official calls independently", () => {
            const { dc, socket } = makeDeviceConnection();

            socket.receive("call:offer", offerProps("call-A"), vi.fn());
            socket.receive("call:offer", offerProps("call-B"), vi.fn());
            expect(callsMap(dc).size).toBe(2);

            socket.receive("call:ended", "call-A");

            expect(callsMap(dc).has("call-A")).toBe(false);
            expect(callsMap(dc).has("call-B")).toBe(true);
        });
    });

    describe("accepting an official offer", () => {
        it("reads ACTIVE once accepted and sends the WebRTC answer", async () => {
            const { dc, socket } = makeDeviceConnection();
            const received: CallSession[] = [];
            dc.on("incomingCall", (call) => received.push(call));
            socket.receive("call:offer", offerProps("call-1"), vi.fn());

            const { data, error } = await IncomingCallProxy(received[0]).accept();

            expect(error).toBeNull();
            expect(data?.status).toBe("ACTIVE");
            const accepted = socket.withAck.find((s) => s.event === "call.accept");
            expect(accepted?.args).toEqual(["call-1", { type: "webRTC", sdp: "v=0\r\nfake-answer-sdp" }]);
        });
    });

    describe("outgoing call", () => {
        function setupStartCall(id: string, callType: CallType = "UNOFFICIAL") {
            const { dc, socket } = makeDeviceConnection();

            // Device UP para o canCall() passar.
            socket.receive("device:init", "open", callType, null, null, false);

            socket.ackResponse = { type: "success", result: { id, type: callType, peer } };

            return { dc, socket };
        }

        it("adds call to map after startCall succeeds", async () => {
            const { dc } = setupStartCall("call-out-1");

            await dc.startCall("5511999999999");

            expect(callsMap(dc).has("call-out-1")).toBe(true);
        });

        it("removes call from map when remote hangs up (call:ended)", async () => {
            const { dc, socket } = setupStartCall("call-out-1");

            await dc.startCall("5511999999999");
            expect(callsMap(dc).has("call-out-1")).toBe(true);

            socket.receive("call:ended", "call-out-1");

            expect(callsMap(dc).has("call-out-1")).toBe(false);
        });

        it("removes call from map when peer rejects (call:rejected)", async () => {
            const { dc, socket } = setupStartCall("call-out-1");

            await dc.startCall("5511999999999");
            expect(callsMap(dc).has("call-out-1")).toBe(true);

            socket.receive("call:rejected", "call-out-1");

            expect(callsMap(dc).has("call-out-1")).toBe(false);
        });

        it("removes call from map on timeout (call:unanswered)", async () => {
            const { dc, socket } = setupStartCall("call-out-1");

            await dc.startCall("5511999999999");
            expect(callsMap(dc).has("call-out-1")).toBe(true);

            socket.receive("call:unanswered", "call-out-1");

            expect(callsMap(dc).has("call-out-1")).toBe(false);
        });

        it("does not remove call for rejected event targeting a different id", async () => {
            const { dc, socket } = setupStartCall("call-out-1");

            await dc.startCall("5511999999999");
            socket.receive("call:rejected", "other-call");

            expect(callsMap(dc).has("call-out-1")).toBe(true);
        });

        it("returns error and does not add call when device cannot call", async () => {
            const { dc, socket } = makeDeviceConnection();
            socket.receive("device:init", "error", "official", null, null, false);

            const result = await dc.startCall("5511999999999");

            expect(result.error?.code).toBe("DEVICE_ERROR");
            expect(callsMap(dc).size).toBe(0);
        });

        it("sends webRTC mediaplan in call.start when device callType is official", async () => {
            const { dc, socket } = setupStartCall("call-out-1", "OFFICIAL");

            await dc.startCall("5511999999999");

            const started = socket.withAck.find((s) => s.event === "call.start");
            expect(started?.args[0]).toBe("5511999999999");
            expect(started?.args[1]).toEqual({ type: "webRTC", sdp: "v=0\r\nfake-offer-sdp" });
        });

        it("sends none mediaplan in call.start when device callType is unofficial", async () => {
            const { dc, socket } = setupStartCall("call-out-1", "UNOFFICIAL");

            await dc.startCall("5511999999999");

            const started = socket.withAck.find((s) => s.event === "call.start");
            expect(started?.args[1]).toEqual({ type: "none" });
        });

        it("outgoing Call.type follows device.callType, not the server response 'type'", async () => {
            const { dc, socket } = makeDeviceConnection();
            socket.receive("device:init", "open", "UNOFFICIAL", null, null, false);

            // O servidor mente e diz OFFICIAL na resposta do call.start.
            socket.ackResponse = { type: "success", result: { id: "call-out-1", type: "OFFICIAL", peer } };

            await dc.startCall("5511999999999");

            const routed = callsMap(dc).get("call-out-1") as { session: { type: string } } | undefined;
            expect(routed?.session.type).toBe("UNOFFICIAL");
        });
    });

    describe("restriction", () => {
        it("device:init with restricted=true reports a restriction without a deadline", () => {
            const { dc, socket } = makeDeviceConnection();
            const cb = vi.fn();
            dc.on("restrictionChanged", cb);

            socket.receive("device:init", "open", "UNOFFICIAL", null, null, true);

            expect(dc.restriction).toEqual({ until: null });
            expect(cb).toHaveBeenCalledWith({ until: null });
        });

        it("device:init parses the deadline into a Date", () => {
            const { dc, socket } = makeDeviceConnection();
            const iso = "2030-01-15T12:34:56.000Z";

            socket.receive("device:init", "open", "UNOFFICIAL", null, null, true, iso);

            expect(dc.restriction?.until).toBeInstanceOf(Date);
            expect(dc.restriction?.until?.toISOString()).toBe(iso);
        });

        it("device:init from an older instance restricts without a deadline", () => {
            const { dc, socket } = makeDeviceConnection();

            socket.receive("device:init", "open", "UNOFFICIAL", null, null, true);

            expect(dc.restriction).toEqual({ until: null });
        });

        it("device:restriction:changed comes and goes as one value", () => {
            const { dc, socket } = makeDeviceConnection();
            socket.receive("device:init", "open", "UNOFFICIAL", null, null, false);

            const cb = vi.fn();
            dc.on("restrictionChanged", cb);

            socket.receive("device:restriction:changed", true);
            expect(dc.restriction).toEqual({ until: null });
            expect(cb).toHaveBeenLastCalledWith({ until: null });

            socket.receive("device:restriction:changed", false);
            expect(dc.restriction).toBeNull();
            expect(cb).toHaveBeenLastCalledWith(null);
        });

        it("device:restriction:changed parses the deadline into a Date", () => {
            const { dc, socket } = makeDeviceConnection();
            socket.receive("device:init", "open", "UNOFFICIAL", null, null, false);

            const iso = "2030-01-15T12:34:56.000Z";

            socket.receive("device:restriction:changed", true, iso);

            expect(dc.restriction?.until?.toISOString()).toBe(iso);
        });

        it("startCall proceeds when device is restricted (backend owns the gate)", async () => {
            const { dc, socket } = makeDeviceConnection();
            socket.receive("device:init", "open", "UNOFFICIAL", null, null, true);
            socket.ackResponse = { type: "success", result: { id: "call-restricted", type: "UNOFFICIAL", peer } };

            const result = await dc.startCall("5511999999999");

            expect(result.error).toBeNull();
            expect(callsMap(dc).has("call-restricted")).toBe(true);
        });
    });
});

describe("the Device handed to the integrator", () => {
    it("keeps reading the device as it changes, and not as it was when listed", () => {
        const { dc, socket } = makeDeviceConnection();
        const device: Device = dc;

        socket.receive("device:init", "open", "OFFICIAL", null, null, false);

        expect(device.status).toBe("open");
    });
});
