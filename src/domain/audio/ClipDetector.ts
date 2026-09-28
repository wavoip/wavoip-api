/**
 * Quanto do áudio está estourando.
 *
 * Um microfone com ganho alto demais — no sistema ou num botão físico — entrega amostras já
 * ceifadas no teto do Int16. O que foi ceifado não volta: nenhum ganho automático recupera,
 * e a voz chega áspera do outro lado. O mesmo vale para o áudio que chega: se veio estourado,
 * baixar o volume não conserta, só deixa o chiado mais baixo.
 *
 * Então a biblioteca não tenta consertar; ela mede e conta, para a interface poder avisar
 * quem pode resolver — a pessoa, baixando o ganho.
 *
 * A janela é deslizante para o número acompanhar a voz: um estouro de um segundo atrás não
 * pode manter o aviso aceso depois que a pessoa corrigiu.
 */
const CEILING = 32_000;
const WINDOW_SAMPLES = 16_000;

export class ClipDetector {
    private clipped = 0;
    private counted = 0;

    /** A fração de amostras no teto, de 0 a 1. Acima de poucos por cento já se ouve. */
    get fraction(): number {
        return this.counted === 0 ? 0 : this.clipped / this.counted;
    }

    push(pcm: Int16Array): void {
        for (let i = 0; i < pcm.length; i += 1) {
            if (pcm[i] >= CEILING || pcm[i] <= -CEILING) this.clipped += 1;
        }
        this.counted += pcm.length;
        this.forgetOldest();
    }

    /**
     * Amostras já normalizadas em -1..1, como o `AnalyserNode` do navegador entrega. O teto
     * ali é o mesmo, expresso na outra escala.
     */
    pushNormalized(samples: Float32Array): void {
        const limit = CEILING / 32_768;
        for (let i = 0; i < samples.length; i += 1) {
            if (samples[i] >= limit || samples[i] <= -limit) this.clipped += 1;
        }
        this.counted += samples.length;
        this.forgetOldest();
    }

    reset(): void {
        this.clipped = 0;
        this.counted = 0;
    }

    /**
     * Encolhe a contagem em vez de guardar as amostras: a proporção é o que interessa, e
     * guardar um segundo de áudio só para contar de novo seria desperdício.
     */
    private forgetOldest(): void {
        if (this.counted <= WINDOW_SAMPLES) return;

        const keep = WINDOW_SAMPLES / this.counted;
        this.clipped = Math.round(this.clipped * keep);
        this.counted = WINDOW_SAMPLES;
    }
}
