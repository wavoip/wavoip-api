import { FRAME_SAMPLES, SAMPLE_RATE, type AudioSource } from "@/platform/node/audioIo";

const TONE_HZ = 440;
const AMPLITUDE = 12_000;

/** Uma fonte de áudio que gera um tom audível, no lugar de um arquivo ou de um TTS. */
export class ToneSource implements AudioSource {
    private ticker: ReturnType<typeof setInterval> | null = null;
    private phase = 0;

    start(onFrame: (pcm: Int16Array) => void): void {
        this.ticker = setInterval(() => onFrame(this.nextFrame()), 10);
    }

    stop(): void {
        if (this.ticker) clearInterval(this.ticker);
        this.ticker = null;
    }

    private nextFrame(): Int16Array {
        const frame = new Int16Array(FRAME_SAMPLES);
        for (let i = 0; i < FRAME_SAMPLES; i += 1) {
            frame[i] = Math.round(AMPLITUDE * Math.sin((2 * Math.PI * TONE_HZ * this.phase) / SAMPLE_RATE));
            this.phase += 1;
        }
        return frame;
    }
}
