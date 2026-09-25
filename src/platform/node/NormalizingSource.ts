import { Pcm } from "@/domain/audio/pcm";
import { type AudioSource, SAMPLE_RATE } from "@/platform/node/audioIo";
import type { PcmConverter } from "@/platform/node/PcmConverter";

/** Uma fonte que já fala o formato interno: Int16, mono, 16 kHz. */
export type NormalizedSource = {
    start(onFrame: (pcm: Int16Array) => void): void;
    stop(): void;
};

/**
 * Põe o áudio do integrador no formato que a biblioteca usa por dentro — Int16, mono,
 * 16 kHz — para que ele possa entregar o que o decodificador dele já produz.
 *
 * A ordem importa: converter e juntar os canais acontece aqui, porque é barato e reduz o que
 * vai para o reamostrador; só a reamostragem, que é o trabalho pesado, passa pelo conversor
 * e pode estar em outro thread.
 */
export class NormalizingSource implements NormalizedSource {
    private readonly channels: number;

    constructor(
        private readonly source: AudioSource,
        private readonly converter: PcmConverter,
    ) {
        this.channels = source.channelCount ?? 1;
    }

    start(onFrame: (pcm: Int16Array) => void): void {
        this.converter.reset();
        this.source.start((frame) => {
            const mono = Pcm.downmix(Pcm.toInt16(frame), this.channels);
            this.converter.convert(mono, onFrame);
        });
    }

    stop(): void {
        this.source.stop();
        this.converter.close();
    }

    /** A taxa de onde o áudio vem, para quem monta o conversor. */
    static rateOf(source: AudioSource): number {
        return source.sampleRate ?? SAMPLE_RATE;
    }
}
