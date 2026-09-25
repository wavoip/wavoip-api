import { type AudioSink, SAMPLE_RATE } from "@/platform/node/audioIo";
import type { PcmConverter } from "@/platform/node/PcmConverter";

/**
 * Entrega ao sumidouro do integrador na taxa que ele pediu, e não na de dentro da
 * biblioteca. Sem isto, gravar um WAV de 44,1 kHz obrigaria quem integra a reamostrar de
 * novo, do lado de fora, com o mesmo cuidado com os agudos.
 */
export class ResamplingSink implements AudioSink {
    readonly sampleRate: number;

    constructor(
        private readonly sink: AudioSink,
        private readonly converter: PcmConverter,
    ) {
        this.sampleRate = ResamplingSink.rateOf(sink);
    }

    write(pcm: Int16Array): void {
        this.converter.convert(pcm, (converted) => this.sink.write(converted));
    }

    end(): void {
        this.converter.close();
        this.sink.end();
    }

    /** A taxa para onde o áudio vai, para quem monta o conversor. */
    static rateOf(sink: AudioSink): number {
        return sink.sampleRate ?? SAMPLE_RATE;
    }
}
