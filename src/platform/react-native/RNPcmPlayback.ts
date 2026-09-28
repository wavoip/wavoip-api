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
    /** Quanto cada bloco enfileirado vale em ms, pelo id que a fila devolveu. */
    private readonly queuedByBuffer = new Map<string, number>();
    private queuedMs = 0;

    constructor(private readonly context: BaseAudioContext) {
        this.resampler = new SincResampler(CALL_RATE, context.sampleRate);
        this.queue = context.createBufferQueueSource();
        this.queue.connect(context.destination);
        this.queue.onBufferEnded = (event) => this.settle(event.bufferId);
        // `start()` sem argumentos lança: o `react-native-audio-api` assume `offset = -1` como
        // sentinela e a validação logo abaixo rejeita todo offset negativo. Passar 0 é o que
        // faz a fila começar — descoberto num Galaxy A55, porque o dublê do teste não valida.
        this.queue.start(0, 0);
    }

    write(pcm: ArrayBuffer): void {
        const samples = new Int16Array(pcm);
        // Fila cheia quer dizer que a rede entregou mais rápido do que o aparelho toca.
        // Descartar o novo atrasaria menos que enfileirar, e atraso em voz não se recupera.
        if (this.queuedMs >= MAX_QUEUE_MS) return;

        const converted = this.resampler.process(samples);
        if (converted.length === 0) return;

        const blockMs = (samples.length / CALL_RATE) * 1000;
        this.queuedByBuffer.set(this.queue.enqueueBuffer(this.bufferOf(converted)), blockMs);
        this.queuedMs += blockMs;
    }

    /**
     * O bloco que acabou de tocar sai da conta pela duração que ele tinha, e não por um
     * valor fixo: os blocos que voltam do relay não têm todos o mesmo tamanho, e descontar
     * menos do que se somou faz a conta subir sozinha até o teto — daí em diante `write`
     * descarta tudo, e a chamada fica picada até o fim.
     */
    private settle(bufferId: string): void {
        const blockMs = this.queuedByBuffer.get(bufferId);
        if (blockMs === undefined) return;

        this.queuedByBuffer.delete(bufferId);
        this.queuedMs = Math.max(0, this.queuedMs - blockMs);
    }

    bufferedMs(): number {
        return this.queuedMs;
    }

    stop(): void {
        this.queue.clearBuffers();
        this.queue.stop();
        this.resampler.reset();
        this.queuedByBuffer.clear();
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
