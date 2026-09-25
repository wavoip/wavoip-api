import { SincResampler } from "@/domain/audio/SincResampler";
import type { PcmPlayback } from "@/ports/runtime/AudioEnginePort";
import type { AudioBufferQueueSourceNode, BaseAudioContext } from "react-native-audio-api";

const CALL_RATE = 16_000;
const INT16_SCALE = 32_768;
/** Quanto áudio pode esperar antes de valer mais cortar do que atrasar a voz. */
const MAX_QUEUE_MS = 400;

/**
 * Toca o PCM que volta do relay, enfileirando bloco a bloco.
 *
 * A fila do `AudioBufferQueueSourceNode` é o que existe de mais próximo de um stream aqui: cada
 * bloco entra atrás do anterior e toca na ordem. O contexto do aparelho tem a própria taxa —
 * quase nunca 16 kHz —, então cada bloco é reamostrado na entrada.
 */
export class RNPcmPlayback implements PcmPlayback {
    private readonly resampler: SincResampler;
    private readonly queue: AudioBufferQueueSourceNode;
    private queuedMs = 0;

    constructor(private readonly context: BaseAudioContext) {
        this.resampler = new SincResampler(CALL_RATE, context.sampleRate);
        this.queue = context.createBufferQueueSource();
        this.queue.connect(context.destination);
        this.queue.onBufferEnded = () => {
            this.queuedMs = Math.max(0, this.queuedMs - 10);
        };
        this.queue.start();
    }

    write(pcm: ArrayBuffer): void {
        const samples = new Int16Array(pcm);
        // Fila cheia quer dizer que a rede entregou mais rápido do que o aparelho toca.
        // Descartar o novo atrasaria menos que enfileirar, e atraso em voz não se recupera.
        if (this.queuedMs >= MAX_QUEUE_MS) return;

        const converted = this.resampler.process(samples);
        if (converted.length === 0) return;

        this.queue.enqueueBuffer(this.bufferOf(converted));
        this.queuedMs += (samples.length / CALL_RATE) * 1000;
    }

    bufferedMs(): number {
        return this.queuedMs;
    }

    stop(): void {
        this.queue.clearBuffers();
        this.queue.stop();
        this.resampler.reset();
        this.queuedMs = 0;
    }

    /** O grafo de áudio fala Float32 em -1..1; o relay fala Int16. */
    private bufferOf(samples: Int16Array): ReturnType<BaseAudioContext["createBuffer"]> {
        const buffer = this.context.createBuffer(1, samples.length, this.context.sampleRate);
        const channel = new Float32Array(samples.length);
        for (let i = 0; i < samples.length; i += 1) channel[i] = samples[i] / INT16_SCALE;
        buffer.copyToChannel(channel, 0);
        return buffer;
    }
}
