import type { AudioSink } from "@/platform/node/audioIo";

/** Guarda tudo o que chega, no lugar de gravar em arquivo. */
export class RecordingSink implements AudioSink {
    readonly samples: number[] = [];
    ended = false;

    /** A taxa em que o teste quer receber; sem ela, a da chamada. */
    constructor(readonly sampleRate?: number) {}

    write(pcm: Int16Array): void {
        for (const sample of pcm) this.samples.push(sample);
    }

    end(): void {
        this.ended = true;
    }

    /** O maior valor absoluto visto: zero quer dizer que só chegou silêncio. */
    get peak(): number {
        return this.samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
    }
}
