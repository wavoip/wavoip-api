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
    private converter: PcmConverter | null = null;

    /**
     * Recebe uma fábrica, e não um conversor pronto, porque o par `start`/`stop` acontece mais
     * de uma vez: o diagnóstico abre e fecha o microfone antes da primeira chamada. Guardar
     * uma instância só fazia o `stop` fechá-la e o `start` seguinte usar um conversor morto —
     * com o worker ligado, o áudio saía em silêncio absoluto e nada dizia por quê.
     */
    constructor(
        private readonly source: AudioSource,
        private readonly openConverter: () => PcmConverter,
    ) {
        this.channels = source.channelCount ?? 1;
    }

    start(onFrame: (pcm: Int16Array) => void): void {
        const converter = this.openConverter();
        this.converter = converter;

        this.source.start((frame) => {
            const mono = Pcm.downmix(Pcm.toInt16(frame), this.channels);
            converter.convert(mono, onFrame);
        });
    }

    stop(): void {
        this.source.stop();
        this.converter?.close();
        this.converter = null;
    }

    /** A taxa de onde o áudio vem, para quem monta o conversor. */
    static rateOf(source: AudioSource): number {
        return source.sampleRate ?? SAMPLE_RATE;
    }
}
