import type { NormalizedSource } from "@/platform/node/NormalizingSource";
import type { Unsubscribe } from "@/modules/shared/EventEmitter";

/**
 * O `AudioSource` do integrador é um só, e mais de um consumidor o quer: a track do WebRTC
 * e, na chamada não oficial, o `capturePcm` do relay. Chamar `start` duas vezes num arquivo
 * ou num TTS não daria duas cópias do áudio — daria duas leituras concorrentes.
 *
 * Então ele é ligado no primeiro assinante e desligado quando o último sai.
 *
 * O mute mora aqui, e não em quem consome, porque é o único ponto por onde os dois caminhos
 * passam. É o mesmo papel do `track.enabled = false` no navegador: a fonte cala, e quem lê
 * dela nem sabe que havia áudio.
 */
export class SharedAudioSource {
    private readonly listeners = new Set<(pcm: Int16Array) => void>();
    private mirror: ((pcm: Int16Array) => void) | null = null;
    private running = false;
    private silenced = false;

    constructor(private readonly source: NormalizedSource) {}

    /** Cala a fonte para todos os consumidores de uma vez. */
    silence(silenced: boolean): void {
        this.silenced = silenced;
    }

    /**
     * Copia para um observador tudo que passa, já silenciado se for o caso.
     *
     * Ele não conta como consumidor: não liga a fonte nem a mantém de pé. Quem grava o que
     * está sendo dito não deve fazer o microfone abrir sozinho — e o que interessa gravar é
     * justamente o que a chamada está mandando.
     */
    mirrorTo(observer: (pcm: Int16Array) => void): void {
        this.mirror = observer;
    }

    subscribe(onFrame: (pcm: Int16Array) => void): Unsubscribe {
        this.listeners.add(onFrame);
        this.startOnce();
        return () => {
            this.listeners.delete(onFrame);
            this.stopWhenIdle();
        };
    }

    private startOnce(): void {
        if (this.running) return;
        this.running = true;
        this.source.start((pcm) => this.fanOut(pcm));
    }

    private stopWhenIdle(): void {
        if (!this.running || this.listeners.size > 0) return;
        this.running = false;
        this.source.stop();
    }

    private fanOut(pcm: Int16Array): void {
        const frame = this.silenced ? new Int16Array(pcm.length) : pcm;
        for (const listener of this.listeners) listener(frame);
        this.mirror?.(frame);
    }
}
