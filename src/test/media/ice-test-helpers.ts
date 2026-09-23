import { type Mock, vi } from "vitest";

export class MockMediaStreamTrack {
    private listeners = new Map<string, Set<() => void>>();
    enabled = false;

    addEventListener(event: string, listener: () => void) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event)?.add(listener);
    }

    dispatchEvent(event: string) {
        for (const listener of this.listeners.get(event) ?? []) listener();
    }
}

/**
 * Diferente de um PC de verdade, nada completa sozinho: o teste conduz o fim da coleta e
 * as transições de ICE pelos helpers `_*`.
 */
export class MockRTCPeerConnection {
    _config: RTCConfiguration;
    _iceListenerCounts = { added: 0, removed: 0 };

    connectionState: RTCPeerConnectionState = "new";
    iceConnectionState: RTCIceConnectionState = "new";
    iceGatheringState: RTCIceGatheringState = "new";

    addTrack: Mock = vi.fn();
    close: Mock = vi.fn();
    createDataChannel: Mock = vi.fn();
    setRemoteDescription: Mock = vi.fn().mockResolvedValue(undefined);
    createAnswer: Mock = vi.fn().mockResolvedValue({ type: "answer", sdp: "mock-answer-sdp" });
    createOffer: Mock = vi.fn().mockResolvedValue({ type: "offer", sdp: "mock-offer-sdp" });
    setLocalDescription: Mock = vi.fn().mockResolvedValue(undefined);
    localDescription = { type: "answer", sdp: "mock-answer-sdp" } as RTCSessionDescription;
    getStats: Mock = vi.fn().mockResolvedValue(new Map());

    namedListeners = new Map<string, Set<(...args: unknown[]) => void>>();

    constructor(config?: RTCConfiguration) {
        this._config = config ?? {};
        instances.push(this);
    }

    addEventListener(event: string, listener: (...args: unknown[]) => void) {
        if (!this.namedListeners.has(event)) this.namedListeners.set(event, new Set());
        this.namedListeners.get(event)?.add(listener);
        if (event === "icegatheringstatechange") this._iceListenerCounts.added += 1;
    }

    removeEventListener(event: string, listener: (...args: unknown[]) => void) {
        this.namedListeners.get(event)?.delete(listener);
        if (event === "icegatheringstatechange") this._iceListenerCounts.removed += 1;
    }

    dispatchEvent(event: string, payload?: unknown) {
        for (const listener of this.namedListeners.get(event) ?? []) listener(payload);
    }

    _completeGathering() {
        this.iceGatheringState = "complete";
        this.dispatchEvent("icegatheringstatechange");
    }

    _fireIceCandidate(type: RTCIceCandidateType) {
        this.dispatchEvent("icecandidate", { candidate: { type } });
    }

    _fireIceConnectionState(state: RTCIceConnectionState) {
        this.iceConnectionState = state;
        this.dispatchEvent("iceconnectionstatechange");
    }

    _fireConnectionState(state: RTCPeerConnectionState) {
        this.connectionState = state;
        this.dispatchEvent("connectionstatechange");
    }
}

const instances: MockRTCPeerConnection[] = [];

export interface PcFactory {
    MockRTCPeerConnection: typeof MockRTCPeerConnection;
    instances: MockRTCPeerConnection[];
    last(): MockRTCPeerConnection;
    reset(): void;
}

export function buildMockPeerConnection(): PcFactory {
    return {
        MockRTCPeerConnection,
        instances,
        last(): MockRTCPeerConnection {
            const inst = instances[instances.length - 1];
            if (!inst) throw new Error("No RTCPeerConnection instance created yet");
            return inst;
        },
        reset() {
            instances.length = 0;
        },
    };
}

export interface MockMediaManager {
    setMuted: Mock;
    startMedia: Mock;
    stopMedia: Mock;
    audioContext: {
        createMediaStreamSource: Mock;
        createAnalyser: Mock;
        createGain: Mock;
        destination: object;
    };
    _analyser: { fftSize: number; getByteTimeDomainData: Mock; connect: Mock };
    _stream: MediaStream;
    _track: MockMediaStreamTrack;
}

export function makeMockMediaManager(): MockMediaManager {
    const analyser = {
        fftSize: 256,
        getByteTimeDomainData: vi.fn((arr: Uint8Array) => arr.fill(128)),
        connect: vi.fn(),
        disconnect: vi.fn(),
    };
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const audioContext = {
        createMediaStreamSource: vi.fn().mockReturnValue(source),
        createAnalyser: vi.fn().mockReturnValue(analyser),
        createGain: vi.fn().mockReturnValue({ gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }),
        destination: {},
    };
    const mockTrack = new MockMediaStreamTrack();
    const mockStream = {
        getTracks: vi.fn().mockReturnValue([mockTrack]),
        getAudioTracks: vi.fn().mockReturnValue([mockTrack]),
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

export class MockAudio {
    muted = false;
    srcObject: MediaStream | null = null;
}
