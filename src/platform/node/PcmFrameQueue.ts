import { FRAME_SAMPLES } from "@/platform/node/audioIo";

const SILENCE = new Int16Array(FRAME_SAMPLES);

/**
 * Recorta o PCM que chega em frames do tamanho fixo que o WebRTC quer. Quem alimenta
 * empurra pedaços de qualquer tamanho e num ritmo qualquer; quem consome puxa de 10 em 10ms
 * e não pode esperar — sem frame pronto, sai silêncio, que é o que a chamada faz quando o
 * outro lado cala.
 */
export class PcmFrameQueue {
    private pending: Int16Array = new Int16Array(0);

    push(pcm: Int16Array): void {
        const merged = new Int16Array(this.pending.length + pcm.length);
        merged.set(this.pending);
        merged.set(pcm, this.pending.length);
        this.pending = merged;
    }

    /**
     * O próximo frame, ou silêncio se ainda não há um inteiro.
     *
     * O `slice` copia, e é por isso que ele está aqui em vez de `subarray`: uma view
     * compartilha o buffer de trás, e o `RTCAudioSource` do wrtc valida o buffer inteiro, não
     * a janela. Com `subarray` ele recusava o frame — `Expected a .byteLength of 320, not
     * 618` — sempre que sobrava resto na fila, o que só acontece quando há reamostragem.
     */
    take(): Int16Array {
        if (this.pending.length < FRAME_SAMPLES) return SILENCE;

        const frame = this.pending.slice(0, FRAME_SAMPLES);
        this.pending = this.pending.slice(FRAME_SAMPLES);
        return frame;
    }

    /** Quantos milissegundos de áudio esperam para sair. */
    get bufferedMs(): number {
        return (this.pending.length / FRAME_SAMPLES) * 10;
    }

    clear(): void {
        this.pending = new Int16Array(0);
    }
}
