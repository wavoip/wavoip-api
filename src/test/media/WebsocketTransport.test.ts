import { WebsocketTransport } from "@/modules/media/WebSocket";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// AudioWorkletNode + MediaStreamAudioSourceNode + AudioContext stubs
// ---------------------------------------------------------------------------

class MockAudioWorkletNode {
    port = { onmessage: null, postMessage: vi.fn() };
    connect = vi.fn();
    disconnect = vi.fn();
}

class MockMediaStreamAudioSourceNode {
    connect = vi.fn();
    disconnect = vi.fn();
    constructor(public stream: MediaStream) {}
}

class MockAnalyser {
    fftSize = 0;
    connect = vi.fn();
    disconnect = vi.fn();
}

function makeMockAudioContext() {
    return {
        state: "running",
        destination: {},
        createMediaStreamSource: vi.fn((s: MediaStream) => new MockMediaStreamAudioSourceNode(s)),
        createAnalyser: vi.fn(() => new MockAnalyser()),
        suspend: vi.fn().mockResolvedValue(undefined),
    };
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

    const audioContext = makeMockAudioContext();
    const mockTrack = { kind: "audio" } as MediaStreamTrack;
    const mockStream = { getAudioTracks: () => [mockTrack], getTracks: () => [mockTrack] } as unknown as MediaStream;

    return {
        audioContext,
        on,
        _emit: emit,
        waitReady: vi.fn().mockResolvedValue(undefined),
        startMedia: vi.fn().mockResolvedValue(mockStream),
        stopMedia: vi.fn().mockResolvedValue(undefined),
        _audioContext: audioContext,
    };
}

class MockWebSocket {
    static OPEN = 1;
    readyState = MockWebSocket.OPEN;
    binaryType = "";
    listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    send = vi.fn();
    close = vi.fn();
    addEventListener(event: string, cb: (...args: unknown[]) => void) {
        const arr = this.listeners.get(event) ?? [];
        arr.push(cb);
        this.listeners.set(event, arr);
    }
    constructor(public url: string) {}
}

describe("WebsocketTransport", () => {
    beforeEach(() => {
        vi.stubGlobal("AudioWorkletNode", MockAudioWorkletNode);
        vi.stubGlobal("WebSocket", MockWebSocket);
        vi.stubGlobal("MediaStream", function (this: MediaStream, tracks: MediaStreamTrack[]) {
            // biome-ignore lint/suspicious/noExplicitAny: stub
            (this as any).getAudioTracks = () => tracks;
            // biome-ignore lint/suspicious/noExplicitAny: stub
            (this as any).getTracks = () => tracks;
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe("microphone hot-swap", () => {
        it("on mediaManager.micChanged rebuilds the source node from the new track", async () => {
            const mm = makeMockMediaManager();
            const transport = new WebsocketTransport(mm as never, { host: "h", port: "1" }, "tk");

            await transport.start();

            const createCalls = mm._audioContext.createMediaStreamSource.mock.calls.length;
            expect(createCalls).toBeGreaterThan(0);

            const newTrack = { kind: "audio" } as MediaStreamTrack;
            mm._emit("micChanged", { deviceId: "mic-2" } as MediaDeviceInfo, newTrack);
            await Promise.resolve();

            // After swap, createMediaStreamSource called again with a stream containing the new track
            expect(mm._audioContext.createMediaStreamSource.mock.calls.length).toBe(createCalls + 1);
            const swappedStream = mm._audioContext.createMediaStreamSource.mock.calls.at(-1)?.[0] as MediaStream;
            expect(swappedStream.getAudioTracks()[0]).toBe(newTrack);
        });

        it("does not rebuild source when emitted track is null", async () => {
            const mm = makeMockMediaManager();
            const transport = new WebsocketTransport(mm as never, { host: "h", port: "1" }, "tk");

            await transport.start();
            const createCalls = mm._audioContext.createMediaStreamSource.mock.calls.length;

            mm._emit("micChanged", { deviceId: "mic-2" } as MediaDeviceInfo, null);
            await Promise.resolve();

            expect(mm._audioContext.createMediaStreamSource.mock.calls.length).toBe(createCalls);
        });

        it("unsubscribes from micChanged on stop()", async () => {
            const mm = makeMockMediaManager();
            const transport = new WebsocketTransport(mm as never, { host: "h", port: "1" }, "tk");

            await transport.start();
            await transport.stop();

            const createCalls = mm._audioContext.createMediaStreamSource.mock.calls.length;
            mm._emit("micChanged", { deviceId: "mic-2" } as MediaDeviceInfo, { kind: "audio" } as MediaStreamTrack);
            await Promise.resolve();

            expect(mm._audioContext.createMediaStreamSource.mock.calls.length).toBe(createCalls);
        });
    });
});
