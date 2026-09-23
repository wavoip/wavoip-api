import type { AudioRuntime } from "@/modules/media/ITransport";
import type { AudioEnginePort, AudioHandle, PcmPlayback } from "@/ports/runtime/AudioEnginePort";
import type { MicrophonePort } from "@/ports/runtime/MicrophonePort";
import type { MediaStreamLike, MediaTrackLike } from "@/ports/runtime/PeerConnectionPort";

/** Uma track de microfone que só guarda o `enabled`, que é o que o mute mexe. */
export class FakeAudioTrack implements MediaTrackLike {
    enabled = false;
    stopped = false;
    private readonly listeners = new Map<string, Set<() => void>>();

    stop(): void {
        this.stopped = true;
    }

    getSettings(): { deviceId?: string } {
        return { deviceId: "fake-mic" };
    }

    addEventListener(type: "mute" | "unmute" | "ended", listener: () => void): void {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type)?.add(listener);
    }

    removeEventListener(type: "mute" | "unmute" | "ended", listener: () => void): void {
        this.listeners.get(type)?.delete(listener);
    }

    fire(type: "mute" | "unmute" | "ended"): void {
        for (const listener of this.listeners.get(type) ?? []) listener();
    }
}

export class FakeAudioStream implements MediaStreamLike {
    constructor(readonly track = new FakeAudioTrack()) {}

    getTracks(): MediaTrackLike[] {
        return [this.track];
    }

    getAudioTracks(): MediaTrackLike[] {
        return [this.track];
    }

    addTrack(): void {}
    removeTrack(): void {}
}

export class FakeMicrophone implements MicrophonePort {
    readonly stream = new FakeAudioStream();
    muted = false;
    opens = 0;
    closes = 0;

    async open(): Promise<MediaStreamLike> {
        this.opens += 1;
        return this.stream;
    }

    async close(): Promise<void> {
        this.closes += 1;
    }
}

/** Um handle que só registra que foi fechado. */
class FakeAudioHandle implements AudioHandle {
    stopped = false;
    readonly meter = { kind: "fake-meter" };

    stop(): void {
        this.stopped = true;
    }
}

class FakePcmPlayback extends FakeAudioHandle {
    readonly written: ArrayBuffer[] = [];

    write(pcm: ArrayBuffer): void {
        this.written.push(pcm);
    }
}

/**
 * O motor sem `AudioContext`: cada método guarda o handle que devolveu, para o teste
 * conferir o que foi aberto e o que foi fechado.
 */
export class FakeAudioEngine implements AudioEnginePort {
    outputLatency = 0;
    prepared = 0;
    resumed = 0;
    suspended = 0;
    closed = 0;
    readonly played: FakeAudioHandle[] = [];
    readonly monitored: FakeAudioHandle[] = [];
    readonly captured: FakeAudioHandle[] = [];
    readonly playbacks: FakePcmPlayback[] = [];
    /** Entrega um frame como se viesse do reamostrador do microfone. */
    emitCapturedFrame: (pcm: ArrayBuffer) => void = () => {};

    async prepare(): Promise<void> {
        this.prepared += 1;
    }

    async resume(): Promise<void> {
        this.resumed += 1;
    }

    async suspend(): Promise<void> {
        this.suspended += 1;
    }

    async close(): Promise<void> {
        this.closed += 1;
    }

    playStream(): AudioHandle {
        const handle = new FakeAudioHandle();
        this.played.push(handle);
        return handle;
    }

    monitorStream(): AudioHandle {
        const handle = new FakeAudioHandle();
        this.monitored.push(handle);
        return handle;
    }

    capturePcm(_stream: MediaStreamLike, onFrame: (pcm: ArrayBuffer) => void): AudioHandle {
        const handle = new FakeAudioHandle();
        this.captured.push(handle);
        this.emitCapturedFrame = onFrame;
        return handle;
    }

    playPcm(): PcmPlayback & AudioHandle {
        const playback = new FakePcmPlayback();
        this.playbacks.push(playback);
        return playback;
    }
}

export class FakeAudioRuntime implements AudioRuntime {
    readonly engine = new FakeAudioEngine();
    readonly microphone = new FakeMicrophone();
}
