import { SincResampler } from "@/domain/audio/SincResampler";
import { type AudioSink, SAMPLE_RATE } from "@/platform/node/audioIo";

/**
 * Entrega ao sumidouro do integrador na taxa que ele pediu, e não na de dentro da
 * biblioteca. Sem isto, gravar um WAV de 44,1 kHz obrigaria quem integra a reamostrar de
 * novo, do lado de fora, com o mesmo cuidado de anti-aliasing.
 */
export class ResamplingSink implements AudioSink {
    readonly sampleRate: number;
    private readonly resampler: SincResampler;

    constructor(private readonly sink: AudioSink) {
        this.sampleRate = sink.sampleRate ?? SAMPLE_RATE;
        this.resampler = new SincResampler(SAMPLE_RATE, this.sampleRate);
    }

    write(pcm: Int16Array): void {
        const converted = this.resampler.process(pcm);
        if (converted.length > 0) this.sink.write(converted);
    }

    end(): void {
        this.resampler.reset();
        this.sink.end();
    }
}
