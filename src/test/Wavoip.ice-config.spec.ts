import { describe, expect, it, vi } from "vitest";

const { getSocket } = vi.hoisted(() => {
    type SocketListener = (...args: unknown[]) => void;
    let last: { receive(event: string, ...args: unknown[]): void } | null = null;

    function make() {
        const listeners = new Map<string, SocketListener[]>();
        const socket = {
            connected: false,
            connect: vi.fn(),
            disconnect: vi.fn(),
            emit: vi.fn(),
            timeout: () => ({ emitWithAck: async () => ({ type: "success" }) }),
            on(event: string, cb: SocketListener) {
                if (!listeners.has(event)) listeners.set(event, []);
                listeners.get(event)?.push(cb);
                return socket;
            },
            off: () => socket,
            receive(event: string, ...args: unknown[]) {
                for (const cb of listeners.get(event) ?? []) cb(...args);
            },
        };
        last = socket;
        return socket;
    }

    return { makeSocket: make, getSocket: () => last ?? make() };
});

vi.mock("@/adapters/socketio/DeviceSocket", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/adapters/socketio/DeviceSocket")>();
    return { ...actual, DeviceWebSocketFactory: vi.fn(() => getSocket()) };
});

import { Wavoip } from "@/Wavoip";
import type { WavoipRuntime } from "@/ports/WavoipRuntime";
import type { IceServer, PeerConnectionLike } from "@/ports/runtime/PeerConnectionPort";
import { FakeAudioRuntime } from "@/test/fakes/FakeAudioRuntime";
import { buildMockPeerConnection } from "@/test/media/ice-test-helpers";

const peerFactory = buildMockPeerConnection();

/**
 * O `iceConfig` só importa se chegar na conexão de verdade, e é lá que este teste olha —
 * o caminho inteiro, do construtor do `Wavoip` até a fábrica que o runtime injetou.
 */
function wavoipWith(iceServers?: IceServer[]) {
    peerFactory.reset();
    const runtime = new FakeAudioRuntime() as unknown as WavoipRuntime & { createPeer: unknown };
    const seen: Array<{ iceServers: IceServer[] }> = [];
    runtime.createPeer = (config: { iceServers: IceServer[] }) => {
        seen.push(config);
        // O mock tem a forma do `RTCPeerConnection` do navegador, não a da porta.
        return new peerFactory.MockRTCPeerConnection() as unknown as PeerConnectionLike;
    };

    const wavoip = new Wavoip({
        tokens: ["token-a"],
        runtime,
        ...(iceServers ? { iceConfig: { iceServers } } : {}),
    });
    return { wavoip, seen, socket: getSocket() };
}

/** Uma oferta WebRTC monta o transporte na hora, que é quando a conexão nasce. */
function receiveOffer(socket: { receive(event: string, ...args: unknown[]): void }) {
    socket.receive("device:init", "open", "OFFICIAL", null, null, false);
    socket.receive(
        "call:offer",
        {
            id: "call-1",
            peer: { phone: "5511", displayName: null, profilePicture: null },
            offer: { type: "webRTC", sdp: "v=0" },
        },
        vi.fn(),
    );
}

describe("iceConfig", () => {
    it("reaches the peer connection the runtime builds", () => {
        const custom = [{ urls: "stun:custom.example:3478" }];
        const { seen, socket } = wavoipWith(custom);

        receiveOffer(socket);

        expect(seen).toHaveLength(1);
        expect(seen[0].iceServers).toEqual(custom);
    });

    it("falls back to the library's own STUN servers", () => {
        const { seen, socket } = wavoipWith();

        receiveOffer(socket);

        // O padrão da biblioteca é um servidor com várias URLs de STUN.
        expect(seen[0].iceServers).not.toHaveLength(0);
        expect(String(seen[0].iceServers[0].urls)).toContain("stun:");
    });

    it("reaches devices added after construction", () => {
        const custom = [{ urls: "stun:late.example:3478" }];
        const { wavoip, seen } = wavoipWith(custom);

        wavoip.addDevices(["token-b"]);
        receiveOffer(getSocket());

        expect(seen[0].iceServers).toEqual(custom);
    });
});
