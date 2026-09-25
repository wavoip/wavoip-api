import { Pcm } from "@/domain/audio/pcm";
import { SincResampler } from "@/domain/audio/SincResampler";
import { type AudioSource, SAMPLE_RATE } from "@/platform/node/audioIo";

/** Uma fonte que já fala o formato interno: Int16, mono, 16 kHz. */
export type NormalizedSource = {
    start(onFrame: (pcm: Int16Array) => void): void;
    stop(): void;
};

/**
 * Põe o áudio do integrador no formato que a biblioteca usa por dentro — Int16, mono,
 * 16 kHz — para que ele possa entregar o que o decodificador dele já produz.
 *
 * A ordem importa: converter, depois juntar os canais, e só então reamostrar. Reamostrar
 * antes de misturar custaria o dobro do trabalho e mexeria em amostras que vão sumir.
 */
export class NormalizingSource implements NormalizedSource {
    private readonly resampler: SincResampler;
    private readonly channels: number;

    constructor(private readonly source: AudioSource) {
        this.channels = source.channelCount ?? 1;
        this.resampler = new SincResampler(source.sampleRate ?? SAMPLE_RATE, SAMPLE_RATE);
    }

    start(onFrame: (pcm: Int16Array) => void): void {
        this.resampler.reset();
        this.source.start((frame) => {
            const normalized = this.normalize(frame);
            if (normalized.length > 0) onFrame(normalized);
        });
    }

    stop(): void {
        this.source.stop();
    }

    private normalize(frame: Int16Array | Float32Array): Int16Array {
        return this.resampler.process(Pcm.downmix(Pcm.toInt16(frame), this.channels));
    }
}
