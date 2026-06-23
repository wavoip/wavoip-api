import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted socket factory — must be defined before vi.mock() calls
// ---------------------------------------------------------------------------

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
            /** Simulate a message arriving from the server */
            receive(event: string, ...args: unknown[]) {
                for (const cb of listeners.get(event) ?? []) cb(...args);
            },
            /** Test helper — count listeners for an event */
            listenerCount(event: string): number {
                return listeners.get(event)?.length ?? 0;
            },
        };
        _last = s;
        return s;
    }

    return { makeSocket: _make, getSocket: () => _last ?? _make() };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/modules/device/WebSocket", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/modules/device/WebSocket")>();
    return { ...actual, DeviceWebSocketFactory: vi.fn(makeSocket) };
});

vi.mock("axios", () => ({
    default: {
        create: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({ data: { result: null } }),
        })),
    },
}));

vi.mock("@/modules/media/WebRTC", () => ({
    WebRTCTransport: class {
        createOffer = vi.fn().mockResolvedValue("v=0\r\nfake-offer-sdp");
        setAnswer = vi.fn().mockResolvedValue(undefined);
        start = vi.fn().mockResolvedValue(undefined);
        stop = vi.fn().mockResolvedValue(undefined);
        on = vi.fn();
        emit = vi.fn();
        off = vi.fn();
    },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { DeviceConnection } from "@/modules/device/DeviceConnection";
import type { MediaManager } from "@/modules/media/MediaManager";
import type { CallType } from "@/modules/device/Call";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const peer = { phone: "5511999999999", displayName: "Test", profilePicture: null };

function makeMockMediaManager(): MediaManager {
    return {} as MediaManager;
}

function makeDeviceConnection() {
    const mm = makeMockMediaManager();
    const dc = new DeviceConnection(mm, "test-token");
    const socket = getSocket();
    return { dc, socket };
}

/** Access the routing table inside the DeviceConnection's CallRouter. */
function callsMap(dc: DeviceConnection): Map<string, unknown> {
    return (dc as unknown as { router: { calls: Map<string, unknown> } }).router.calls;
}

const offerProps = (id: string) => ({
    id,
    peer,
    offer: { type: "webRTC" as const, sdp: "v=0\r\n..." },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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
            const received: Array<{ reject: () => Promise<unknown> }> = [];
            dc.on("offerReceived", (offer) => received.push(offer));

            socket.receive("call:offer", offerProps("call-1"), vi.fn());
            expect(callsMap(dc).has("call-1")).toBe(true);
            expect(received).toHaveLength(1);

            await received[0].reject();

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

    describe("outgoing call", () => {
        function setupStartCall(id: string, callType: CallType = "UNOFFICIAL") {
            const { dc, socket } = makeDeviceConnection();

            // Simulate device being UP so canCall() passes
            socket.receive("device:init", "UP", callType, null, null, false);

            socket.emit.mockImplementation((event: string, ...args: unknown[]) => {
                if (event === "call.start") {
                    const callback = args[args.length - 1] as (r: unknown) => void;
                    callback({
                        type: "success",
                        result: { id, type: callType, peer },
                    });
                }
            });

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

            expect(result.err).toBeDefined();
            expect(callsMap(dc).size).toBe(0);
        });

        it("sends webRTC mediaplan in call.start when device callType is official", async () => {
            const { dc, socket } = setupStartCall("call-out-1", "OFFICIAL");

            await dc.startCall("5511999999999");

            const callStartEmit = socket.emit.mock.calls.find((c: unknown[]) => c[0] === "call.start");
            expect(callStartEmit).toBeDefined();
            const [, phone, mediaPlan] = callStartEmit as [string, string, { type: string; sdp?: string }];
            expect(phone).toBe("5511999999999");
            expect(mediaPlan.type).toBe("webRTC");
            expect(mediaPlan.sdp).toBe("v=0\r\nfake-offer-sdp");
        });

        it("sends none mediaplan in call.start when device callType is unofficial", async () => {
            const { dc, socket } = setupStartCall("call-out-1", "UNOFFICIAL");

            await dc.startCall("5511999999999");

            const callStartEmit = socket.emit.mock.calls.find((c: unknown[]) => c[0] === "call.start");
            expect(callStartEmit).toBeDefined();
            const [, , mediaPlan] = callStartEmit as [string, string, { type: string }];
            expect(mediaPlan.type).toBe("none");
        });

        it("outgoing Call.type follows device.callType, not the server response 'type'", async () => {
            const { dc, socket } = makeDeviceConnection();
            socket.receive("device:init", "UP", "UNOFFICIAL", null, null, false);

            // Server lies and reports OFFICIAL in the call.start response.
            socket.emit.mockImplementation((event: string, ...args: unknown[]) => {
                if (event === "call.start") {
                    const callback = args[args.length - 1] as (r: unknown) => void;
                    callback({ type: "success", result: { id: "call-out-1", type: "OFFICIAL", peer } });
                }
            });

            await dc.startCall("5511999999999");

            const call = callsMap(dc).get("call-out-1") as { type: string } | undefined;
            expect(call?.type).toBe("UNOFFICIAL");
        });
    });

    describe("restriction", () => {
        it("device:init with restricted=true updates state and fires restrictedChanged", () => {
            const { dc, socket } = makeDeviceConnection();
            const cb = vi.fn();
            dc.on("restrictedChanged", cb);

            socket.receive("device:init", "UP", "UNOFFICIAL", null, null, true);

            expect(dc.restricted).toBe(true);
            expect(dc.restrictedUntil).toBe(null);
            expect(cb).toHaveBeenCalledWith(true, null);
        });

        it("device:init parses restrictedUntil ISO string into Date", () => {
            const { dc, socket } = makeDeviceConnection();
            const cb = vi.fn();
            dc.on("restrictedChanged", cb);
            const iso = "2030-01-15T12:34:56.000Z";

            socket.receive("device:init", "UP", "UNOFFICIAL", null, null, true, iso);

            expect(dc.restrictedUntil).toBeInstanceOf(Date);
            expect(dc.restrictedUntil?.toISOString()).toBe(iso);
            expect(cb).toHaveBeenCalledWith(true, expect.any(Date));
        });

        it("device:init from older instance (no restrictedUntil arg) keeps restrictedUntil null", () => {
            const { dc, socket } = makeDeviceConnection();

            socket.receive("device:init", "UP", "UNOFFICIAL", null, null, true);

            expect(dc.restricted).toBe(true);
            expect(dc.restrictedUntil).toBe(null);
        });

        it("device:restriction:changed updates state and fires restrictedChanged", () => {
            const { dc, socket } = makeDeviceConnection();
            socket.receive("device:init", "UP", "UNOFFICIAL", null, null, false);

            const cb = vi.fn();
            dc.on("restrictedChanged", cb);

            socket.receive("device:restriction:changed", true);
            expect(dc.restricted).toBe(true);
            expect(cb).toHaveBeenLastCalledWith(true, null);

            socket.receive("device:restriction:changed", false);
            expect(dc.restricted).toBe(false);
            expect(cb).toHaveBeenLastCalledWith(false, null);
        });

        it("device:restriction:changed parses restrictedUntil ISO string into Date", () => {
            const { dc, socket } = makeDeviceConnection();
            socket.receive("device:init", "UP", "UNOFFICIAL", null, null, false);

            const cb = vi.fn();
            dc.on("restrictedChanged", cb);
            const iso = "2030-01-15T12:34:56.000Z";

            socket.receive("device:restriction:changed", true, iso);

            expect(dc.restricted).toBe(true);
            expect(dc.restrictedUntil?.toISOString()).toBe(iso);
            expect(cb).toHaveBeenLastCalledWith(true, expect.any(Date));
        });

        it("startCall returns error when device is restricted", async () => {
            const { dc, socket } = makeDeviceConnection();
            socket.receive("device:init", "UP", "UNOFFICIAL", null, null, true);

            const result = await dc.startCall("5511999999999");

            expect(result.err).toBeDefined();
            expect(callsMap(dc).size).toBe(0);
        });
    });
});
