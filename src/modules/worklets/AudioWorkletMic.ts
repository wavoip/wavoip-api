/**
 * AudioWorkletMic.ts — ResampleProcessor
 *
 * Captures raw Float32 samples from the microphone at the AudioContext's
 * native sample rate, resamples them to 16000 Hz using LibSampleRate, and
 * posts Int16 PCM chunks (320 samples / 640 bytes each) to the main thread
 * for transmission over WebSocket.
 *
 * Depends on LibSampleRate being loaded into the worklet scope BEFORE this
 * module is added:
 *   await ctx.audioWorklet.addModule(libSampleRateUrl);
 *   await ctx.audioWorklet.addModule('./AudioWorkletMic.js');
 */

const OUTPUT_SAMPLE_RATE = 16_000;
const CHUNK_SAMPLES = 320; // 20ms @ 16000 Hz

class ResampleProcessor extends AudioWorkletProcessor {
    /** LibSampleRate converter. Null until async init resolves. */
    private src: unknown = null;

    /** Resampled Int16 samples waiting to be chunked and posted. */
    private accumulated: Int16Array = new Int16Array(0);

    /** Raw Float32 quanta that arrived before the resampler was ready. */
    private pending: Float32Array[] = [];

    constructor(options: AudioWorkletNodeOptions) {
        super(options);
        this.initResampler();
    }

    // ── Init ─────────────────────────────────────────────────────────────────

    private async initResampler(): Promise<void> {
        // @ts-expect-error — LibSampleRate injected as worklet global
        const { create, ConverterType } = globalThis.LibSampleRate;

        // sampleRate is the AudioWorklet built-in global — the actual context rate.
        this.src = await create(1, sampleRate, OUTPUT_SAMPLE_RATE, {
            converterType: ConverterType.SRC_SINC_BEST_QUALITY,
        });

        // Drain any quanta that arrived during async init.
        for (const quantum of this.pending) {
            this.resampleAndAccumulate(quantum);
        }
        this.pending = [];
    }

    // ── Audio process ─────────────────────────────────────────────────────────

    process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
        const input = inputs[0]?.[0];
        if (!input?.length) return true;

        if (this.src === null) {
            // Resampler not ready — keep a copy (the original is a view, not owned).
            this.pending.push(new Float32Array(input));
            return true;
        }

        this.resampleAndAccumulate(input);
        return true;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private resampleAndAccumulate(input: Float32Array): void {
        // @ts-expect-error — LibSampleRate instance
        const resampled: Float32Array = this.src.full(input);
        const pcm = this.floatToInt16(resampled);

        // Append to accumulator.
        const next = new Int16Array(this.accumulated.length + pcm.length);
        next.set(this.accumulated, 0);
        next.set(pcm, this.accumulated.length);
        this.accumulated = next;

        // Post complete 320-sample (640-byte) chunks.
        while (this.accumulated.length >= CHUNK_SAMPLES) {
            const chunk = this.accumulated.slice(0, CHUNK_SAMPLES);
            this.accumulated = this.accumulated.slice(CHUNK_SAMPLES);
            // Transfer the underlying buffer — zero-copy across the worklet boundary.
            this.port.postMessage(chunk.buffer, [chunk.buffer]);
        }
    }

    private floatToInt16(float32: Float32Array): Int16Array {
        const out = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
            out[i] = Math.max(-32768, Math.min(32767, float32[i] * 32767));
        }
        return out;
    }
}

registerProcessor("resample-processor", ResampleProcessor);
