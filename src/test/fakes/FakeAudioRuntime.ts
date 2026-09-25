import type { MediaRuntime } from "@/modules/media/ITransport";
import type { AudioEngineState, AudioEnginePort, AudioHandle, AudioMeter, PcmPlayback } from "@/ports/runtime/AudioEnginePort";
import type { MicrophonePort } from "@/ports/runtime/MicrophonePort";
import type { MediaSocketFactory } from "@/ports/runtime/MediaSocketPort";
import type { MediaStreamLike, MediaTrackLike, PeerConnectionFactory } from "@/ports/runtime/PeerConnectionPort";
import { webMediaSocket } from "@/platform/web/webMediaSocket";
import { webPeerConnection } from "@/platform/web/webPeerConnection";

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
    isOpen = false;
    /** O teste faz o microfone recusar, como o navegador recusa quem nega a permissão. */
    failWith: Error | null = null;

    async open(): Promise<MediaStreamLike> {
        this.opens += 1;
        if (this.failWith) throw this.failWith;
        this.isOpen = true;
        return this.stream;
    }

    async close(): Promise<void> {
        this.closes += 1;
        this.isOpen = false;
    }

    setMuted(muted: boolean): void {
        this.muted = muted;
    }
}

/** Um handle que só registra que foi fechado. */
class FakeAudioHandle implements AudioMeter {
    stopped = false;
    /** `null` imita a plataforma que não mede aqui, como o React Native. */
    reading: number | null = 0;

    /** O espectro que o teste quiser ver; vazio imita a plataforma que não analisa. */
    bands = new Uint8Array(0);

    level(): number | null {
        return this.reading;
    }

    spectrum(): Uint8Array | null {
        return this.reading === null ? null : this.bands;
    }

    stop(): void {
        this.stopped = true;
    }
}

class FakePcmPlayback extends FakeAudioHandle {
    readonly written: ArrayBuffer[] = [];
    buffered: number | null = null;

    write(pcm: ArrayBuffer): void {
        this.written.push(pcm);
    }

    bufferedMs(): number | null {
        return this.buffered;
    }
}

/**
 * O motor sem `AudioContext`: cada método guarda o handle que devolveu, para o teste
 * conferir o que foi aberto e o que foi fechado.
 */
export class FakeAudioEngine implements AudioEnginePort {
    /** O teste muda para "suspended" quando quer imitar o navegador esperando um gesto. */
    state: AudioEngineState = "running";

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

    renderRemote(): AudioMeter {
        const handle = new FakeAudioHandle();
        this.played.push(handle);
        return handle;
    }

    monitorStream(): AudioMeter {
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

    playPcm(): PcmPlayback {
        const playback = new FakePcmPlayback();
        this.playbacks.push(playback);
        return playback;
    }
}

/** Um motor que não mede nada, como o do React Native: o nativo toca e captura sozinho. */
export class UnmeasuringAudioEngine extends FakeAudioEngine {
    override renderRemote(): AudioMeter {
        return silence(super.renderRemote());
    }

    override monitorStream(): AudioMeter {
        return silence(super.monitorStream());
    }
}

function silence(meter: AudioMeter): AudioMeter {
    (meter as FakeAudioHandle).reading = null;
    return meter;
}

export class FakeAudioRuntime implements MediaRuntime {
    readonly engine: FakeAudioEngine = new FakeAudioEngine();
    readonly microphone = new FakeMicrophone();
    // Os testes de WebRTC e de relay trocam o global; a fábrica padrão é a da web para eles
    // continuarem valendo. Quem quer provar ambiente sem WebRTC zera o campo.
    createPeer: PeerConnectionFactory | undefined = webPeerConnection;
    openSocket: MediaSocketFactory | undefined = webMediaSocket;
}
