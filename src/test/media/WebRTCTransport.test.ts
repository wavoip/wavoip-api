import { WebRTCTransport } from "@/modules/media/webrtc/Transport";
import { FakeAudioRuntime } from "@/test/fakes/FakeAudioRuntime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MockMediaStreamTrack {
    private listeners = new Map<string, Set<() => void>>();

    addEventListener(event: string, listener: () => void) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event)?.add(listener);
    }

    dispatchEvent(event: string) {
        for (const listener of this.listeners.get(event) ?? []) listener();
    }
}

let mockPcInstance: MockRTCPeerConnection;

class MockRTCPeerConnection {
    _remoteTrack: MockMediaStreamTrack | null = null;
    connectionState: RTCPeerConnectionState = "new";
    iceGatheringState: RTCIceGatheringState = "new";

    private eventListeners = new Map<string, Set<(...args: unknown[]) => void>>();

    addTrack = vi.fn();
    close = vi.fn();
    setRemoteDescription = vi.fn().mockResolvedValue(undefined);
    createAnswer = vi.fn().mockResolvedValue({ type: "answer", sdp: "mock-answer-sdp" });
    createOffer = vi.fn().mockResolvedValue({ type: "offer", sdp: "mock-offer-sdp" });
    setLocalDescription = vi.fn().mockImplementation(async () => {
        // Cede uma microtask para o answerPromise.resolve() rodar antes do ontrack.
        await Promise.resolve();
        const mockRemoteTrack = new MockMediaStreamTrack();
        const mockStream = { id: "stream-1", getAudioTracks: () => [mockRemoteTrack] } as unknown as MediaStream;
        mockPcInstance._remoteTrack = mockRemoteTrack;
        mockPcInstance.simulateTrack(mockStream);
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

    dispatchEvent(event: string, payload?: unknown) {
        for (const listener of this.eventListeners.get(event) ?? []) listener(payload);
    }

    simulateTrack(stream: MediaStream) {
        this.dispatchEvent("track", { streams: [stream] });
    }

    simulateConnectionState(state: RTCPeerConnectionState) {
        this.connectionState = state;
        this.dispatchEvent("connectionstatechange");
    }
}

async function startTransport(transport: WebRTCTransport) {
    await transport.accept();
}

describe("WebRTCTransport", () => {
    beforeEach(() => {
        vi.stubGlobal("RTCPeerConnection", MockRTCPeerConnection);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it("initial state: status=disconnected, peerMuted=false, stats zeroed", () => {
        const audio = new FakeAudioRuntime();
        const transport = new WebRTCTransport(audio.asRuntime(), "offer-sdp");

        expect(transport.status).toBe("disconnected");
        expect(transport.peerMuted).toBe(false);
        expect(transport.stats.rtt).toEqual({ min: 0, max: 0, avg: 0 });
        expect(transport.stats.tx).toEqual({ total: 0, total_bytes: 0, loss: 0, bitrate_kbps: 0, audio_level: 0 });
        expect(transport.stats.rx).toEqual({
            total: 0,
            total_bytes: 0,
            loss: 0,
            bitrate_kbps: 0,
            audio_level: 0,
            jitter_ms: 0,
        });
        expect(transport.stats.audio_context).toEqual({ output_latency_ms: 0 });
    });

    describe("start()", () => {
        it("opens the microphone, addTrack, setRemoteDescription, createAnswer, setLocalDescription", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio.asRuntime(), "offer-sdp");

            await startTransport(transport);

            expect(audio.microphone.opens).toBe(1);
            expect(mockPcInstance.addTrack).toHaveBeenCalledOnce();
            expect(mockPcInstance.setRemoteDescription).toHaveBeenCalledWith({ type: "offer", sdp: "offer-sdp" });
            expect(mockPcInstance.createAnswer).toHaveBeenCalledOnce();
            expect(mockPcInstance.setLocalDescription).toHaveBeenCalledWith({ type: "answer", sdp: "mock-answer-sdp" });
        });

        it("resolves answer promise with the answer SDP", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio.asRuntime(), "offer-sdp");

            const answer = await transport.accept();

            expect(answer).toEqual({ type: "webRTC", sdp: "mock-answer-sdp" });
        });

        it("enables mic track when mediaManager is not muted", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            audio.microphone.muted = false;
            const transport = new WebRTCTransport(audio.asRuntime(), "offer-sdp");

            await startTransport(transport);

            expect(audio.microphone.stream.track.enabled).toBe(true);
        });

        it("keeps mic track disabled when mediaManager is muted", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            audio.microphone.muted = true;
            const transport = new WebRTCTransport(audio.asRuntime(), "offer-sdp");

            await startTransport(transport);

            expect(audio.microphone.stream.track.enabled).toBe(false);
        });
    });

    describe("createOffer()", () => {
        it("enables mic track when mediaManager is not muted", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            audio.microphone.muted = false;
            const transport = new WebRTCTransport(audio.asRuntime());

            await transport.createOffer();

            expect(audio.microphone.stream.track.enabled).toBe(true);
        });

        it("keeps mic track disabled when mediaManager is muted", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            audio.microphone.muted = true;
            const transport = new WebRTCTransport(audio.asRuntime());

            await transport.createOffer();

            expect(audio.microphone.stream.track.enabled).toBe(false);
        });

        it("is idempotent — second createOffer does not re-add tracks", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio.asRuntime());

            await transport.createOffer();
            await transport.createOffer();

            expect(mockPcInstance.addTrack).toHaveBeenCalledTimes(1);
            expect(mockPcInstance.createOffer).toHaveBeenCalledTimes(1);
        });
    });

    describe("stop()", () => {
        it("calls pc.close() and mediaManager.stopMedia()", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio.asRuntime(), "offer-sdp");
            await startTransport(transport);

            await transport.stop();

            expect(mockPcInstance.close).toHaveBeenCalledOnce();
            expect(audio.microphone.closes).toBe(1);
        });

        it("is idempotent — second stop() does not re-close pc or re-stop media", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio.asRuntime(), "offer-sdp");
            await startTransport(transport);

            await transport.stop();
            await transport.stop();

            expect(mockPcInstance.close).toHaveBeenCalledOnce();
            expect(audio.microphone.closes).toBe(1);
        });
    });

    describe("ontrack event", () => {
        it("resolves audioAnalyserIn promise after ontrack fires", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio.asRuntime(), "offer-sdp");
            await startTransport(transport);

            await expect(transport.audioAnalyserIn).resolves.toBeDefined();
        });

        it("resolves audioAnalyserOut promise once mic stream is wired", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio.asRuntime(), "offer-sdp");
            await startTransport(transport);

            await expect(transport.audioAnalyserOut).resolves.toBeDefined();
        });

        it("meters both directions: the remote stream plays and the mic is monitored", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio.asRuntime(), "offer-sdp");
            await startTransport(transport);

            expect(audio.engine.played).toHaveLength(1);
            expect(audio.engine.monitored).toHaveLength(1);
        });
    });

    describe("onconnectionstatechange", () => {
        it("'connecting' → emits statusChanged 'connecting'", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio.asRuntime(), "offer-sdp");
            await startTransport(transport);

            const cb = vi.fn();
            transport.on("statusChanged", cb);
            mockPcInstance.simulateConnectionState("connecting");

            expect(cb).toHaveBeenCalledWith("connecting");
        });

        it("'connected' → emits statusChanged 'connected'", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio.asRuntime(), "offer-sdp");
            await startTransport(transport);

            const cb = vi.fn();
            transport.on("statusChanged", cb);
            mockPcInstance.simulateConnectionState("connected");

            expect(cb).toHaveBeenCalledWith("connected");
        });

        it("'disconnected' → emits statusChanged 'disconnected'", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio.asRuntime(), "offer-sdp");
            await startTransport(transport);

            const cb = vi.fn();
            transport.on("statusChanged", cb);
            mockPcInstance.simulateConnectionState("disconnected");

            expect(cb).toHaveBeenCalledWith("disconnected");
        });

        it("'closed' → emits statusChanged 'disconnected' AND calls stopMedia", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio.asRuntime(), "offer-sdp");
            await startTransport(transport);

            const cb = vi.fn();
            transport.on("statusChanged", cb);
            mockPcInstance.simulateConnectionState("closed");

            expect(cb).toHaveBeenCalledWith("disconnected");
            expect(audio.microphone.closes).toBe(1);
        });
    });

    describe("mute detection (track events)", () => {
        it("emits peerMuted(true) when remote track fires 'mute'", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio.asRuntime(), "offer-sdp");
            await startTransport(transport);

            const cb = vi.fn();
            transport.on("peerMuted", cb);

            mockPcInstance._remoteTrack?.dispatchEvent("mute");

            expect(cb).toHaveBeenCalledWith(true);
            expect(transport.peerMuted).toBe(true);
        });

        it("emits peerMuted(false) when remote track fires 'unmute'", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio.asRuntime(), "offer-sdp");
            await startTransport(transport);

            mockPcInstance._remoteTrack?.dispatchEvent("mute");
            expect(transport.peerMuted).toBe(true);

            const cb = vi.fn();
            transport.on("peerMuted", cb);

            mockPcInstance._remoteTrack?.dispatchEvent("unmute");

            expect(cb).toHaveBeenCalledWith(false);
            expect(transport.peerMuted).toBe(false);
        });

        it("does not re-emit peerMuted when mute state is unchanged", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio.asRuntime(), "offer-sdp");
            await startTransport(transport);

            mockPcInstance._remoteTrack?.dispatchEvent("mute");

            const cb = vi.fn();
            transport.on("peerMuted", cb);

            // Já está mudo: não pode emitir de novo.
            mockPcInstance._remoteTrack?.dispatchEvent("mute");

            expect(cb).not.toHaveBeenCalled();
        });
    });

    describe("stats collection (getStats)", () => {
        it("updates stats.rx and emits statsChanged with inbound-rtp audio stats", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();

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

            const transport = new WebRTCTransport(audio.asRuntime(), "offer-sdp");
            // O mock nasce na instância durante a construção, então é trocado aqui, antes do
            // start(), para a primeira chamada já usar o statsMap.
            const origGetStats = mockPcInstance.getStats;
            mockPcInstance.getStats = vi.fn().mockResolvedValue(statsMap);

            await startTransport(transport);
            origGetStats;

            const cb = vi.fn();
            transport.on("statsChanged", cb);

            // Bem além do intervalo de stats (200ms por padrão).
            await vi.advanceTimersByTimeAsync(5_000);

            expect(cb).toHaveBeenCalled();
            const emittedStats = cb.mock.calls[0][0];
            expect(emittedStats.rx.total).toBeGreaterThan(0);
        });

        it("updates stats.rtt with remote-inbound-rtp stats", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();

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

            const transport = new WebRTCTransport(audio.asRuntime(), "offer-sdp");
            mockPcInstance.getStats = vi.fn().mockResolvedValue(statsMap);

            await startTransport(transport);

            const cb = vi.fn();
            transport.on("statsChanged", cb);

            await vi.advanceTimersByTimeAsync(5_000);

            expect(cb).toHaveBeenCalled();
            const emittedStats = cb.mock.calls[0][0];
            expect(emittedStats.rtt.avg).toBeGreaterThan(0);
        });

        it("captures rx jitter and audio levels from getStats", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();

            const statsMap = new Map<string, unknown>([
                [
                    "inbound",
                    {
                        type: "inbound-rtp",
                        kind: "audio",
                        bytesReceived: 2000,
                        packetsReceived: 100,
                        packetsLost: 0,
                        audioLevel: 0.42,
                        jitter: 0.015,
                    },
                ],
                ["source", { type: "media-source", kind: "audio", audioLevel: 0.7 }],
            ]);

            const transport = new WebRTCTransport(audio.asRuntime(), "offer-sdp");
            mockPcInstance.getStats = vi.fn().mockResolvedValue(statsMap);

            await startTransport(transport);

            const cb = vi.fn();
            transport.on("statsChanged", cb);

            await vi.advanceTimersByTimeAsync(5_000);

            expect(cb).toHaveBeenCalled();
            const emitted = cb.mock.calls[0][0];
            expect(emitted.rx.jitter_ms).toBeCloseTo(15, 5);
            expect(emitted.rx.audio_level).toBe(0.42);
            expect(emitted.tx.audio_level).toBe(0.7);
        });

        it("uses options.statsTickMs as the interval cadence", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio.asRuntime(), "offer-sdp", { statsTickMs: 1_000 });
            await startTransport(transport);

            const cb = vi.fn();
            transport.on("statsChanged", cb);

            await vi.advanceTimersByTimeAsync(500);
            expect(cb).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(600);
            expect(cb).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(1_000);
            expect(cb).toHaveBeenCalledTimes(2);
        });
    });
});
