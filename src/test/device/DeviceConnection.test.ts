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
            /** Simulate a message arriving from the server */
            receive(event: string, ...args: unknown[]) {
                for (const cb of listeners.get(event) ?? []) cb(...args);
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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { DeviceConnection } from "@/modules/device/DeviceConnection";
import type { MediaManager } from "@/modules/media/MediaManager";

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

/** Access the private calls map */
function callsMap(dc: DeviceConnection): Map<string, unknown> {
    return (dc as unknown as { calls: Map<string, unknown> }).calls;
}

const offerProps = (id: string) => ({
    id,
    peer,
    offer: "v=0\r\n...",
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DeviceConnection — calls map cleanup", () => {
    describe("official incoming call", () => {
        it("adds call to map when offer arrives", () => {
            const { dc, socket } = makeDeviceConnection();

            socket.receive("call:offer:official", offerProps("call-1"), vi.fn());

            expect(callsMap(dc).has("call-1")).toBe(true);
        });

        it("removes call from map when remote hangs up (call:ended)", () => {
            const { dc, socket } = makeDeviceConnection();

            socket.receive("call:offer:official", offerProps("call-1"), vi.fn());
            expect(callsMap(dc).has("call-1")).toBe(true);

            socket.receive("call:ended", "call-1");

            expect(callsMap(dc).has("call-1")).toBe(false);
        });

        it("ignores call:ended for a different call id", () => {
            const { dc, socket } = makeDeviceConnection();

            socket.receive("call:offer:official", offerProps("call-1"), vi.fn());
            socket.receive("call:ended", "other-call");

            expect(callsMap(dc).has("call-1")).toBe(true);
        });

        it("removes call from map on timeout (call:status NOT_ANSWERED)", () => {
            const { dc, socket } = makeDeviceConnection();

            socket.receive("call:offer:official", offerProps("call-1"), vi.fn());
            expect(callsMap(dc).has("call-1")).toBe(true);

            socket.receive("call:status", "call-1", "NOT_ANSWERED");

            expect(callsMap(dc).has("call-1")).toBe(false);
        });

        it("removes call from map when consumer rejects the offer", async () => {
            const { dc, socket } = makeDeviceConnection();
            const received: Array<{ reject: () => Promise<unknown> }> = [];
            dc.on("offerReceived", (offer) => received.push(offer));

            socket.receive("call:offer:official", offerProps("call-1"), vi.fn());
            expect(callsMap(dc).has("call-1")).toBe(true);
            expect(received).toHaveLength(1);

            await received[0].reject();

            expect(callsMap(dc).has("call-1")).toBe(false);
        });

        it("handles multiple concurrent official calls independently", () => {
            const { dc, socket } = makeDeviceConnection();

            socket.receive("call:offer:official", offerProps("call-A"), vi.fn());
            socket.receive("call:offer:official", offerProps("call-B"), vi.fn());
            expect(callsMap(dc).size).toBe(2);

            socket.receive("call:ended", "call-A");

            expect(callsMap(dc).has("call-A")).toBe(false);
            expect(callsMap(dc).has("call-B")).toBe(true);
        });
    });

    describe("unofficial outgoing call", () => {
        function setupStartCall(id: string) {
            const { dc, socket } = makeDeviceConnection();

            // Simulate device being UP so canCall() passes
            socket.receive("device:status", "UP");

            socket.emit.mockImplementation((event: string, ...args: unknown[]) => {
                if (event === "call.start") {
                    const callback = args[args.length - 1] as (r: unknown) => void;
                    callback({
                        type: "success",
                        result: { id, peer, transport: { host: "server.example.com", port: "5000" } },
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

        it("removes call from map on timeout (call:status NOT_ANSWERED)", async () => {
            const { dc, socket } = setupStartCall("call-out-1");

            await dc.startCall("5511999999999");
            expect(callsMap(dc).has("call-out-1")).toBe(true);

            socket.receive("call:status", "call-out-1", "NOT_ANSWERED");

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
            socket.receive("device:status", "error");

            const result = await dc.startCall("5511999999999");

            expect(result.err).toBeDefined();
            expect(callsMap(dc).size).toBe(0);
        });
    });
});
