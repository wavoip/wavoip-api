import { WebRTCTransport } from "@/modules/media/WebRTC";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock RTCPeerConnection
// ---------------------------------------------------------------------------

let mockPcInstance: MockRTCPeerConnection;

class MockRTCPeerConnection {
    ontrack: ((e: RTCTrackEvent) => void) | null = null;
    onconnectionstatechange: (() => void) | null = null;
    connectionState: RTCPeerConnectionState = "new";
    iceGatheringState: RTCIceGatheringState = "new";

    private eventListeners = new Map<string, Set<(...args: unknown[]) => void>>();

    addTrack = vi.fn();
    close = vi.fn();
    setRemoteDescription = vi.fn().mockResolvedValue(undefined);
    createAnswer = vi.fn().mockResolvedValue({ type: "answer", sdp: "mock-answer-sdp" });
    setLocalDescription = vi.fn().mockImplementation(async () => {
        // Yield a microtask so answerPromise.resolve() fires before we trigger ontrack
        await Promise.resolve();
        const mockStream = { id: "stream-1" } as MediaStream;
        mockPcInstance.simulateTrack(mockStream);
        // Simulate ICE gathering completing
        mockPcInstance.iceGatheringState = "complete";
        mockPcInstance.dispatchEvent("icegatheringstatechange");
    });
    localDescription = { type: "answer", sdp: "mock-answer-sdp" } as RTCSessionDescription;
    getStats = vi.fn().mockResolvedValue(new Map());

    constructor() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        mockPcInstance = this;
    }

    addEventListener(event: string, listener: (...args: unknown[]) => void) {
        if (!this.eventListeners.has(event)) this.eventListeners.set(event, new Set());
        this.eventListeners.get(event)?.add(listener);
    }

    removeEventListener(event: string, listener: (...args: unknown[]) => void) {
        this.eventListeners.get(event)?.delete(listener);
    }

    dispatchEvent(event: string) {
        for (const listener of this.eventListeners.get(event) ?? []) listener();
    }

    simulateTrack(stream: MediaStream) {
        this.ontrack?.({ streams: [stream] } as unknown as RTCTrackEvent);
    }

    simulateConnectionState(state: RTCPeerConnectionState) {
        this.connectionState = state;
        this.onconnectionstatechange?.();
    }
}

// ---------------------------------------------------------------------------
// Mock MediaManager
// ---------------------------------------------------------------------------

function makeMockMediaManager() {
    const analyser = {
        fftSize: 256,
        getByteTimeDomainData: vi.fn((arr: Uint8Array) => arr.fill(128)), // silence = 128, avg deviation = 0
        connect: vi.fn(),
    };
    const source = { connect: vi.fn() };
    const audioContext = {
        createMediaStreamSource: vi.fn().mockReturnValue(source),
        createAnalyser: vi.fn().mockReturnValue(analyser),
        destination: {},
    };
    const mockTrack = { enabled: false };
    const mockStream = {
        getTracks: vi.fn().mockReturnValue([mockTrack]),
        id: "mic-stream",
    } as unknown as MediaStream;

    return {
        setMuted: vi.fn(),
        startMedia: vi.fn().mockResolvedValue(mockStream),
        stopMedia: vi.fn().mockResolvedValue(undefined),
        audioContext,
        _analyser: analyser,
        _stream: mockStream,
        _track: mockTrack,
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function startTransport(transport: WebRTCTransport) {
    await transport.start();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WebRTCTransport", () => {
    beforeEach(() => {
        vi.stubGlobal("RTCPeerConnection", MockRTCPeerConnection);
        vi.stubGlobal(
            "Audio",
            class MockAudio {
                muted = false;
                srcObject: MediaStream | null = null;
            },
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it("initial state: status=disconnected, peerMuted=false, stats zeroed", () => {
        const mm = makeMockMediaManager();
        const transport = new WebRTCTransport(mm as never, "offer-sdp");

        expect(transport.status).toBe("disconnected");
        expect(transport.peerMuted).toBe(false);
        expect(transport.stats.rtt).toEqual({ min: 0, max: 0, avg: 0 });
        expect(transport.stats.tx).toEqual({ total: 0, total_bytes: 0, loss: 0 });
        expect(transport.stats.rx).toEqual({ total: 0, total_bytes: 0, loss: 0 });
    });

    describe("start()", () => {
        it("calls startMedia, addTrack, setRemoteDescription, createAnswer, setLocalDescription", async () => {
            vi.useFakeTimers();
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never, "offer-sdp");

            await startTransport(transport);

            expect(mm.startMedia).toHaveBeenCalledOnce();
            expect(mockPcInstance.addTrack).toHaveBeenCalledOnce();
            expect(mockPcInstance.setRemoteDescription).toHaveBeenCalledWith({ type: "offer", sdp: "offer-sdp" });
            expect(mockPcInstance.createAnswer).toHaveBeenCalledOnce();
            expect(mockPcInstance.setLocalDescription).toHaveBeenCalledWith({ type: "answer", sdp: "mock-answer-sdp" });
        });

        it("resolves answer promise with the answer SDP", async () => {
            vi.useFakeTimers();
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never, "offer-sdp");

            await startTransport(transport);

            const answer = await transport.answer;
            expect(answer).toEqual({ type: "answer", sdp: "mock-answer-sdp" });
        });

        it("enables each mic track before adding to pc", async () => {
            vi.useFakeTimers();
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never, "offer-sdp");

            await startTransport(transport);

            expect(mm._track.enabled).toBe(true);
        });
    });

    describe("stop()", () => {
        it("calls pc.close() and mediaManager.stopMedia()", async () => {
            vi.useFakeTimers();
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never, "offer-sdp");
            await startTransport(transport);

            await transport.stop();

            expect(mockPcInstance.close).toHaveBeenCalledOnce();
            expect(mm.stopMedia).toHaveBeenCalledOnce();
        });
    });

    describe("ontrack event", () => {
        it("resolves audioAnalyser promise after ontrack fires", async () => {
            vi.useFakeTimers();
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never, "offer-sdp");
            await startTransport(transport);

            await expect(transport.audioAnalyser).resolves.toBeDefined();
        });

        it("creates analyser node and connects audio graph", async () => {
            vi.useFakeTimers();
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never, "offer-sdp");
            await startTransport(transport);

            expect(mm.audioContext.createMediaStreamSource).toHaveBeenCalledOnce();
            expect(mm.audioContext.createAnalyser).toHaveBeenCalledOnce();
        });
    });

    describe("onconnectionstatechange", () => {
        it("'connecting' → emits statusChanged 'connecting'", async () => {
            vi.useFakeTimers();
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never, "offer-sdp");
            await startTransport(transport);

            const cb = vi.fn();
            transport.on("statusChanged", cb);
            mockPcInstance.simulateConnectionState("connecting");

            expect(cb).toHaveBeenCalledWith("connecting");
        });

        it("'connected' → emits statusChanged 'connected'", async () => {
            vi.useFakeTimers();
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never, "offer-sdp");
            await startTransport(transport);

            const cb = vi.fn();
            transport.on("statusChanged", cb);
            mockPcInstance.simulateConnectionState("connected");

            expect(cb).toHaveBeenCalledWith("connected");
        });

        it("'disconnected' → emits statusChanged 'disconnected'", async () => {
            vi.useFakeTimers();
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never, "offer-sdp");
            await startTransport(transport);

            const cb = vi.fn();
            transport.on("statusChanged", cb);
            mockPcInstance.simulateConnectionState("disconnected");

            expect(cb).toHaveBeenCalledWith("disconnected");
        });

        it("'closed' → emits statusChanged 'disconnected' AND calls stopMedia", async () => {
            vi.useFakeTimers();
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never, "offer-sdp");
            await startTransport(transport);

            const cb = vi.fn();
            transport.on("statusChanged", cb);
            mockPcInstance.simulateConnectionState("closed");

            expect(cb).toHaveBeenCalledWith("disconnected");
            expect(mm.stopMedia).toHaveBeenCalledOnce();
        });
    });

    describe("mute detection (checkForMute)", () => {
        it("emits peerMuted(true) when FFT average < 0.05 (silence)", async () => {
            vi.useFakeTimers();
            const mm = makeMockMediaManager();
            // getByteTimeDomainData fills with 128 → deviation = 0 → avg = 0 < 0.05 → muted
            const transport = new WebRTCTransport(mm as never, "offer-sdp");
            await startTransport(transport);

            const cb = vi.fn();
            transport.on("peerMuted", cb);

            vi.advanceTimersByTime(1_000);

            expect(cb).toHaveBeenCalledWith(true);
            expect(transport.peerMuted).toBe(true);
        });

        it("emits peerMuted(false) when FFT average >= 0.05 after being muted", async () => {
            vi.useFakeTimers();
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never, "offer-sdp");
            await startTransport(transport);

            // First tick: silence → peerMuted = true
            vi.advanceTimersByTime(1_000);
            expect(transport.peerMuted).toBe(true);

            // Now simulate audio by filling with values != 128
            mm._analyser.getByteTimeDomainData = vi.fn((arr: Uint8Array) => arr.fill(200)); // large deviation

            const cb = vi.fn();
            transport.on("peerMuted", cb);

            vi.advanceTimersByTime(1_000);

            expect(cb).toHaveBeenCalledWith(false);
            expect(transport.peerMuted).toBe(false);
        });

        it("does not re-emit peerMuted when mute state is unchanged", async () => {
            vi.useFakeTimers();
            const mm = makeMockMediaManager();
            // silence throughout
            const transport = new WebRTCTransport(mm as never, "offer-sdp");
            await startTransport(transport);

            vi.advanceTimersByTime(1_000); // → muted = true, emits once
            const cb = vi.fn();
            transport.on("peerMuted", cb);

            vi.advanceTimersByTime(1_000); // still silence → no re-emit

            expect(cb).not.toHaveBeenCalled();
        });
    });

    describe("stats collection (getStats)", () => {
        it("updates stats.rx and emits statsChanged with inbound-rtp audio stats", async () => {
            vi.useFakeTimers();
            const mm = makeMockMediaManager();

            const statsMap = new Map([
                [
                    "inbound",
                    {
                        type: "inbound-rtp",
                        kind: "audio",
                        bytesReceived: 1000,
                        packetsReceived: 50,
                        packetsLost: 2,
                    },
                ],
            ]);
            mockPcInstance?.getStats?.mockResolvedValue(statsMap);

            const transport = new WebRTCTransport(mm as never, "offer-sdp");
            // Override getStats before start so the initial call in start() uses updated mock
            // The mock is set up on the instance after construction, so we need to re-assign:
            const origGetStats = mockPcInstance.getStats;
            mockPcInstance.getStats = vi.fn().mockResolvedValue(statsMap);

            await startTransport(transport);
            origGetStats; // silence unused warning

            const cb = vi.fn();
            transport.on("statsChanged", cb);

            // Advance past the 5s stats interval
            vi.advanceTimersByTime(5_000);
            await Promise.resolve(); // flush async getStats

            expect(cb).toHaveBeenCalled();
            const emittedStats = cb.mock.calls[0][0];
            expect(emittedStats.rx.total).toBeGreaterThan(0);
        });

        it("updates stats.rtt with remote-inbound-rtp stats", async () => {
            vi.useFakeTimers();
            const mm = makeMockMediaManager();

            const statsMap = new Map([
                [
                    "remote-inbound",
                    {
                        type: "remote-inbound-rtp",
                        kind: "audio",
                        roundTripTime: 0.05,
                        roundTripTimeMeasurements: 1,
                        packetsLost: 0,
                        packetsReceived: 10,
                    },
                ],
            ]);

            const transport = new WebRTCTransport(mm as never, "offer-sdp");
            mockPcInstance.getStats = vi.fn().mockResolvedValue(statsMap);

            await startTransport(transport);

            const cb = vi.fn();
            transport.on("statsChanged", cb);

            vi.advanceTimersByTime(5_000);
            await Promise.resolve();

            expect(cb).toHaveBeenCalled();
            const emittedStats = cb.mock.calls[0][0];
            expect(emittedStats.rtt.avg).toBeGreaterThan(0);
        });
    });
});
