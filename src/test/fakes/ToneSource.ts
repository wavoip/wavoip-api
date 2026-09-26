import { type AudioSource, SAMPLE_RATE } from "@/platform/node/audioIo";

const TONE_HZ = 440;
const AMPLITUDE = 12_000;

/** Uma fonte de áudio que gera um tom audível, no lugar de um arquivo ou de um TTS. */
export class ToneSource implements AudioSource {
    private ticker: ReturnType<typeof setInterval> | null = null;
    private phase = 0;

    /** A taxa importa: só quando ela difere da chamada é que o conversor entra no caminho. */
    constructor(readonly sampleRate = SAMPLE_RATE) {}

    start(onFrame: (pcm: Int16Array) => void): void {
        this.ticker = setInterval(() => onFrame(this.nextFrame()), 10);
    }

    stop(): void {
        if (this.ticker) clearInterval(this.ticker);
        this.ticker = null;
    }

    private nextFrame(): Int16Array {
        const size = Math.round(this.sampleRate / 100);
        const frame = new Int16Array(size);
        for (let i = 0; i < size; i += 1) {
            frame[i] = Math.round(AMPLITUDE * Math.sin((2 * Math.PI * TONE_HZ * this.phase) / this.sampleRate));
            this.phase += 1;
        }
        return frame;
    }
}
