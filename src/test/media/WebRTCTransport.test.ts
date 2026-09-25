import { Stats } from "@/domain/call/stats";
import { WebRTCTransport } from "@/modules/media/webrtc/Transport";
import { FakeAudioRuntime, UnmeasuringAudioEngine } from "@/test/fakes/FakeAudioRuntime";
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
        const transport = new WebRTCTransport(audio, "offer-sdp");

        expect(transport.status).toBe("disconnected");
        expect(transport.peerMuted).toBe(false);
        expect(transport.stats).toEqual(Stats.empty());
    });

    describe("start()", () => {
        it("opens the microphone, addTrack, setRemoteDescription, createAnswer, setLocalDescription", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio, "offer-sdp");

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
            const transport = new WebRTCTransport(audio, "offer-sdp");

            const answer = await transport.accept();

            expect(answer).toEqual({ type: "webRTC", sdp: "mock-answer-sdp" });
        });

        it("enables mic track when mediaManager is not muted", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            audio.microphone.muted = false;
            const transport = new WebRTCTransport(audio, "offer-sdp");

            await startTransport(transport);

            expect(audio.microphone.stream.track.enabled).toBe(true);
        });

        it("keeps mic track disabled when mediaManager is muted", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            audio.microphone.muted = true;
            const transport = new WebRTCTransport(audio, "offer-sdp");

            await startTransport(transport);

            expect(audio.microphone.stream.track.enabled).toBe(false);
        });
    });

    describe("createOffer()", () => {
        it("enables mic track when mediaManager is not muted", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            audio.microphone.muted = false;
            const transport = new WebRTCTransport(audio);

            await transport.createOffer();

            expect(audio.microphone.stream.track.enabled).toBe(true);
        });

        it("keeps mic track disabled when mediaManager is muted", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            audio.microphone.muted = true;
            const transport = new WebRTCTransport(audio);

            await transport.createOffer();

            expect(audio.microphone.stream.track.enabled).toBe(false);
        });

        it("is idempotent — second createOffer does not re-add tracks", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio);

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
            const transport = new WebRTCTransport(audio, "offer-sdp");
            await startTransport(transport);

            await transport.stop();

            expect(mockPcInstance.close).toHaveBeenCalledOnce();
            expect(audio.microphone.closes).toBe(1);
        });

        it("is idempotent — second stop() does not re-close pc or re-stop media", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio, "offer-sdp");
            await startTransport(transport);

            await transport.stop();
            await transport.stop();

            expect(mockPcInstance.close).toHaveBeenCalledOnce();
            expect(audio.microphone.closes).toBe(1);
        });
    });

    describe("ontrack event", () => {
        it("reads the incoming level once the remote stream plays", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio, "offer-sdp");
            await startTransport(transport);

            audio.engine.played[0].reading = 0.6;

            expect(transport.audio.in.level()).toBe(0.6);
        });

        it("reads the outgoing level once the mic is monitored", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio, "offer-sdp");
            await startTransport(transport);

            audio.engine.monitored[0].reading = 0.3;

            expect(transport.audio.out.level()).toBe(0.3);
        });

        it("reads zero before the media is up, instead of failing", () => {
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio, "offer-sdp");

            expect(transport.audio.in.level()).toBe(0);
            expect(transport.audio.out.level()).toBe(0);
        });

        it("meters both directions: the remote stream plays and the mic is monitored", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio, "offer-sdp");
            await startTransport(transport);

            expect(audio.engine.played).toHaveLength(1);
            expect(audio.engine.monitored).toHaveLength(1);
        });
    });

    describe("onconnectionstatechange", () => {
        it("'connecting' → emits statusChanged 'connecting'", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio, "offer-sdp");
            await startTransport(transport);

            const cb = vi.fn();
            transport.on("statusChanged", cb);
            mockPcInstance.simulateConnectionState("connecting");

            expect(cb).toHaveBeenCalledWith("connecting");
        });

        it("'connected' → emits statusChanged 'connected'", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio, "offer-sdp");
            await startTransport(transport);

            const cb = vi.fn();
            transport.on("statusChanged", cb);
            mockPcInstance.simulateConnectionState("connected");

            expect(cb).toHaveBeenCalledWith("connected");
        });

        it("'disconnected' → emits statusChanged 'disconnected'", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio, "offer-sdp");
            await startTransport(transport);

            const cb = vi.fn();
            transport.on("statusChanged", cb);
            mockPcInstance.simulateConnectionState("disconnected");

            expect(cb).toHaveBeenCalledWith("disconnected");
        });

        it("'closed' → emits statusChanged 'disconnected' AND calls stopMedia", async () => {
            vi.useFakeTimers();
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio, "offer-sdp");
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
            const transport = new WebRTCTransport(audio, "offer-sdp");
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
            const transport = new WebRTCTransport(audio, "offer-sdp");
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
            const transport = new WebRTCTransport(audio, "offer-sdp");
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

            const transport = new WebRTCTransport(audio, "offer-sdp");
            // O mock nasce na instância durante a construção, então é trocado aqui, antes do
            // start(), para a primeira chamada já usar o statsMap.
            const origGetStats = mockPcInstance.getStats;
            mockPcInstance.getStats = vi.fn().mockResolvedValue(statsMap);

            await startTransport(transport);
            origGetStats;

            const stats = await transport.getStats();

            expect(stats.packets.rx.received).toBeGreaterThan(0);
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

            const transport = new WebRTCTransport(audio, "offer-sdp");
            mockPcInstance.getStats = vi.fn().mockResolvedValue(statsMap);

            await startTransport(transport);

            const stats = await transport.getStats();

            expect(stats.rtt.avg).toBeGreaterThan(0);
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

            const transport = new WebRTCTransport(audio, "offer-sdp");
            mockPcInstance.getStats = vi.fn().mockResolvedValue(statsMap);

            await startTransport(transport);

            const stats = await transport.getStats();

            expect(stats.audio.rx.jitter_ms).toBeCloseTo(15, 5);
            expect(stats.audio.rx.level).toBe(0.42);
            expect(stats.audio.tx.level).toBe(0.7);
        });
    });
});

describe("WebRTCTransport on a runtime without WebRTC", () => {
    /**
     * A recusa não mora aqui: quem decide é o `forCall`, que devolve `null` e faz a chamada
     * falhar com `CALL_TYPE_UNSUPPORTED` antes de qualquer transporte ser montado (ver
     * `CallSession.unsupported.test.ts`). Se um runtime desses chegar até aqui, é defeito
     * nosso, e a mensagem tem de dizer o que chegou.
     */
    it("names the offending runtime if one reaches it anyway", () => {
        const audio = new FakeAudioRuntime();
        audio.createPeer = undefined;

        expect(() => new WebRTCTransport(audio, "offer-sdp")).toThrow(/runtime sem createPeer/);
    });
});

/**
 * O caso do React Native: o áudio não passa pelo motor, porque o nativo toca e captura
 * sozinho. O medidor diz `null` — que é diferente de medir silêncio — e o nível sai do
 * `audioLevel` que o `getStats()` da conexão publica e o adaptador de estatísticas já coleta.
 */
describe("WebRTCTransport on a platform that does not measure audio", () => {
    beforeEach(() => {
        vi.stubGlobal("RTCPeerConnection", MockRTCPeerConnection);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("reads the level from the connection statistics instead", async () => {
        const audio = new FakeAudioRuntime();
        Object.defineProperty(audio, "engine", { value: new UnmeasuringAudioEngine() });
        const transport = new WebRTCTransport(audio, "offer-sdp");

        await startTransport(transport);
        statsOf(transport).rx.level = 0.42;
        statsOf(transport).tx.level = 0.17;

        expect(transport.audio.in.level()).toBe(0.42);
        expect(transport.audio.out.level()).toBe(0.17);

        await transport.stop();
    });

    it("still prefers the engine where it does measure", async () => {
        const audio = new FakeAudioRuntime();
        const transport = new WebRTCTransport(audio, "offer-sdp");

        await startTransport(transport);
        statsOf(transport).rx.level = 0.9;
        audio.engine.played[0].reading = 0.3;

        // O motor mede: o número dele vale, mesmo com estatística dizendo outra coisa.
        expect(transport.audio.in.level()).toBe(0.3);

        await transport.stop();
    });
});

function statsOf(transport: WebRTCTransport): { rx: { level: number }; tx: { level: number } } {
    return transport.stats.audio;
}

/**
 * O espectro é o que desenha uma onda sonora. Onde a plataforma não enxerga o áudio ele vem
 * vazio, e não como uma faixa de zeros: quem desenha checa o `length` e não pinta nada, em
 * vez de pintar silêncio que parece medição.
 */
describe("WebRTCTransport spectrum", () => {
    beforeEach(() => {
        vi.stubGlobal("RTCPeerConnection", MockRTCPeerConnection);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("hands over the bands the engine analysed", async () => {
        const audio = new FakeAudioRuntime();
        const transport = new WebRTCTransport(audio, "offer-sdp");
        await startTransport(transport);

        audio.engine.played[0].bands = Uint8Array.from([10, 200, 30]);

        expect(Array.from(transport.audio.in.spectrum())).toEqual([10, 200, 30]);
        await transport.stop();
    });

    it("is empty where the platform cannot see the audio", async () => {
        const audio = new FakeAudioRuntime();
        Object.defineProperty(audio, "engine", { value: new UnmeasuringAudioEngine() });
        const transport = new WebRTCTransport(audio, "offer-sdp");
        await startTransport(transport);

        expect(transport.audio.in.spectrum()).toHaveLength(0);
        expect(transport.audio.out.spectrum()).toHaveLength(0);
        await transport.stop();
    });
});

/**
 * Regressão: o evento `track` chega mais de uma vez numa renegociação, e cada um criava um
 * consumidor novo do áudio remoto sem parar o anterior. Todos seguiam entregando, e num
 * processo Node a gravação do integrador saía com o dobro ou o triplo da duração da chamada.
 */
describe("WebRTCTransport when the remote track arrives more than once", () => {
    beforeEach(() => {
        vi.stubGlobal("RTCPeerConnection", MockRTCPeerConnection);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("keeps a single consumer of the remote audio", async () => {
        const audio = new FakeAudioRuntime();
        const transport = new WebRTCTransport(audio, "offer-sdp");
        await startTransport(transport);

        // O `startTransport` já entregou uma; a renegociação entrega de novo.
        const stream = { id: "stream-1", getAudioTracks: () => [] } as unknown as MediaStream;
        mockPcInstance.simulateTrack(stream);
        mockPcInstance.simulateTrack(stream);

        const vivos = audio.engine.played.filter((handle) => !handle.stopped);
        expect(audio.engine.played.length).toBeGreaterThan(1);
        expect(vivos).toHaveLength(1);

        await transport.stop();
    });
});
