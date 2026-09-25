import { FRAME_SAMPLES, SAMPLE_RATE } from "@/platform/node/audioIo";
import { PcmFrameQueue } from "@/platform/node/PcmFrameQueue";
import type { SharedAudioSource } from "@/platform/node/SharedAudioSource";
import type { MicrophonePort } from "@/ports/runtime/MicrophonePort";
import type { MediaStreamLike, MediaTrackLike } from "@/ports/runtime/PeerConnectionPort";
import { MediaStream, nonstandard, type RTCAudioSource } from "@/platform/node/wrtc";

const FRAME_INTERVAL_MS = 10;

/**
 * O "microfone" de um Node sem cabeça: o `AudioSource` do integrador, embrulhado numa track
 * de WebRTC.
 *
 * O `RTCAudioSource` do wrtc é empurrado, e quer um frame de 10ms por vez, no relógio. Se a
 * fonte do integrador atrasar, sai silêncio — calar é melhor que a chamada engasgar.
 */
export class NodeMicrophone implements MicrophonePort {
    private readonly queue = new PcmFrameQueue();
    private stream: MediaStreamLike | null = null;
    private ticker: ReturnType<typeof setInterval> | null = null;
    private unsubscribe: (() => void) | null = null;
    private track: MediaTrackLike | null = null;
    private _muted = false;

    constructor(private readonly source: SharedAudioSource) {}

    get muted(): boolean {
        return this._muted;
    }

    get isOpen(): boolean {
        return this.stream !== null;
    }

    async open(): Promise<MediaStreamLike> {
        if (this.stream) return this.stream;

        const audioSource = new nonstandard.RTCAudioSource();
        this.track = audioSource.createTrack() as unknown as MediaTrackLike;
        this.track.enabled = !this._muted;

        this.unsubscribe = this.source.subscribe((pcm) => this.queue.push(pcm));
        this.ticker = setInterval(() => this.pushFrame(audioSource), FRAME_INTERVAL_MS);

        this.stream = new MediaStream([this.track as unknown as MediaStreamTrack]) as unknown as MediaStreamLike;
        return this.stream;
    }

    async close(): Promise<void> {
        if (this.ticker) clearInterval(this.ticker);
        this.unsubscribe?.();
        this.track?.stop();
        this.queue.clear();
        this.ticker = null;
        this.unsubscribe = null;
        this.track = null;
        this.stream = null;
    }

    setMuted(muted: boolean): void {
        this._muted = muted;
        // A fonte cala para os dois caminhos: a track do WebRTC e o `capturePcm` do relay,
        // que não passa por track nenhuma e ficaria falando sozinho.
        this.source.silence(muted);
        // Desabilitar a track não é repetição: o WebRTC para de transmitir pacote, e o que
        // se economiza é banda.
        if (this.track) this.track.enabled = !muted;
    }

    private pushFrame(audioSource: RTCAudioSource): void {
        audioSource.onData({
            samples: this.queue.take(),
            sampleRate: SAMPLE_RATE,
            bitsPerSample: 16,
            channelCount: 1,
            numberOfFrames: FRAME_SAMPLES,
        });
    }
}
