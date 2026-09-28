import { SincResampler } from "@/domain/audio/SincResampler";

/**
 * Reamostragem vista de fora, para que o caminho do áudio não saiba se o trabalho acontece
 * neste thread ou em outro.
 *
 * A entrega é por callback, e não por retorno, justamente porque uma das implementações
 * responde depois: num worker o resultado volta por mensagem. Quem chama não espera.
 */
export interface PcmConverter {
    convert(pcm: Int16Array, emit: (converted: Int16Array) => void): void;
    reset(): void;
    close(): void;
}

/** Reamostra aqui mesmo. É o que serve quando não há o que converter, ou quando há poucas chamadas. */
export class LocalConverter implements PcmConverter {
    private readonly resampler: SincResampler;

    constructor(inputRate: number, outputRate: number) {
        this.resampler = new SincResampler(inputRate, outputRate);
    }

    convert(pcm: Int16Array, emit: (converted: Int16Array) => void): void {
        const converted = this.resampler.process(pcm);
        if (converted.length > 0) emit(converted);
    }

    reset(): void {
        this.resampler.reset();
    }

    close(): void {}
}
