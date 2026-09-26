import { SincResampler } from "@/domain/audio/SincResampler";

/**
 * Um reamostrador que descobre a taxa de entrada em vez de presumi-la.
 *
 * Serve a quem recebe áudio de fora e só sabe a taxa quando o bloco chega: o decodificador
 * do WebRTC entrega no que estiver usando, e um gravador de celular entrega no que o
 * hardware der. Os dois podem mudar no meio da chamada.
 *
 * Trocar a taxa recomeça a emenda entre blocos, e é por isso que o reamostrador só é
 * refeito quando ela muda de verdade.
 */
export class AdaptiveResampler {
    private resampler: SincResampler | null = null;
    private sourceRate = 0;

    constructor(private readonly outputRate: number) {}

    process(pcm: Int16Array, sampleRate: number): Int16Array {
        return this.resamplerFor(sampleRate).process(pcm);
    }

    reset(): void {
        this.resampler?.reset();
    }

    private resamplerFor(rate: number): SincResampler {
        if (!this.resampler || this.sourceRate !== rate) {
            this.sourceRate = rate;
            this.resampler = new SincResampler(rate, this.outputRate);
        }
        return this.resampler;
    }
}
