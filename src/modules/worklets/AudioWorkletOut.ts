/**
 * AudioWorkletOut.ts — AudioDataWorkletStream
 *
 * Receives PCMU-encoded audio (µ-law, 16000 Hz) from the WebSocket via
 * port.postMessage, decodes it to linear PCM, resamples to the AudioContext's
 * native sample rate, and feeds the result into the audio output buffer.
 *
 * Pipeline per chunk:
 *   PCMU bytes (Uint8, 16000 Hz)
 *     → µ-law expand  →  Int16 linear PCM  (16000 Hz)
 *     → normalise     →  Float32           (16000 Hz)
 *     → LibSampleRate →  Float32           (sampleRate Hz)
 *     → ring buffer   →  process() output
 *
 * Depends on LibSampleRate being loaded into the worklet scope BEFORE this
 * module is added:
 *   await ctx.audioWorklet.addModule(libSampleRateUrl);
 *   await ctx.audioWorklet.addModule('./AudioWorkletOut.js');
 */

// ---------------------------------------------------------------------------
// µ-law decode table  (ITU-T G.711)
// Built once at module parse time — O(1) per sample during decode.
// ---------------------------------------------------------------------------

const PCMU_TABLE = new Int16Array(256);

(function buildMuLawTable() {
    for (let i = 0; i < 256; i++) {
        const byte = ~i & 0xff;
        const sign = byte & 0x80 ? -1 : 1;
        const exponent = (byte >> 4) & 0x07;
        const mantissa = byte & 0x0f;
        const magnitude = ((mantissa << 1) | 0x21) << exponent;
        PCMU_TABLE[i] = sign * (magnitude - 33);
    }
})();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PCMU_SAMPLE_RATE = 16_000;

/** Maximum ring buffer size in seconds before jitter recovery kicks in. */
const BUFFER_MAX_SECONDS = 0.5;
/** How many seconds to drop when the buffer overflows. */
const BUFFER_DROP_SECONDS = 0.2;

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

class AudioDataWorkletStream extends AudioWorkletProcessor {
    /** Decoded + resampled Float32 samples ready for playback. */
    private ringBuffer: Float32Array = new Float32Array(0);

    /** LibSampleRate converter. Null until async init resolves. */
    private src: unknown = null;

    /** PCMU byte chunks that arrived before the resampler was ready. */
    private pending: Uint8Array[] = [];

    constructor(options: AudioWorkletNodeOptions) {
        super(options);
        this.port.onmessage = this.onMessage.bind(this);
        this.initResampler();
    }

    // ── Init ─────────────────────────────────────────────────────────────────

    private async initResampler(): Promise<void> {
        // @ts-expect-error — LibSampleRate injected as worklet global
        const { create, ConverterType } = globalThis.LibSampleRate;

        // sampleRate global = AudioContext native rate (e.g. 48000).
        this.src = await create(1, PCMU_SAMPLE_RATE, sampleRate, {
            converterType: ConverterType.SRC_SINC_BEST_QUALITY,
        });

        // Drain chunks that arrived during async init.
        for (const chunk of this.pending) {
            this.decodeAndBuffer(chunk);
        }
        this.pending = [];
    }

    // ── Message handler ───────────────────────────────────────────────────────

    /**
     * Accepts:
     *   - ArrayBuffer          raw PCMU bytes (preferred, zero-copy)
     *   - { buffer: number[] } legacy format from AudioOutput.sendAudioData()
     */
    private onMessage(event: MessageEvent): void {
        let bytes: Uint8Array;

        if (event.data instanceof ArrayBuffer) {
            bytes = new Uint8Array(event.data);
        } else if (Array.isArray(event.data?.buffer)) {
            bytes = new Uint8Array(event.data.buffer);
        } else {
            return;
        }

        if (this.src === null) {
            this.pending.push(bytes);
            return;
        }

        this.decodeAndBuffer(bytes);
    }

    // ── Decode pipeline ───────────────────────────────────────────────────────

    private decodeAndBuffer(bytes: Uint8Array): void {
        // Step 1: µ-law → linear Int16
        const pcm16 = new Int16Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) {
            pcm16[i] = PCMU_TABLE[bytes[i]];
        }

        // Step 2: Int16 → Float32  [-1.0, 1.0]
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) {
            float32[i] = pcm16[i] / 32768;
        }

        // Step 3: resample 16000 Hz → native sampleRate
        // @ts-expect-error — LibSampleRate instance
        const resampled: Float32Array = this.src.full(float32);

        // Step 4: append to ring buffer
        this.append(resampled);
    }

    // ── Ring buffer ───────────────────────────────────────────────────────────

    private append(samples: Float32Array): void {
        const next = new Float32Array(this.ringBuffer.length + samples.length);
        next.set(this.ringBuffer, 0);
        next.set(samples, this.ringBuffer.length);
        this.ringBuffer = next;

        // Jitter guard: drop oldest audio if we're building up too much delay.
        // All thresholds are time-based so they scale with any sample rate.
        const maxSamples = Math.floor(sampleRate * BUFFER_MAX_SECONDS);
        const dropSamples = Math.floor(sampleRate * BUFFER_DROP_SECONDS);

        if (this.ringBuffer.length > maxSamples) {
            this.ringBuffer = this.ringBuffer.subarray(dropSamples);
        }
    }

    // ── Audio process ─────────────────────────────────────────────────────────

    process(_inputs: Float32Array[][], outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
        const output = outputs[0]?.[0];
        if (!output) return true;

        const want = output.length; // always 128 frames per Web Audio quantum

        if (this.ringBuffer.length === 0) {
            // Underrun — silence is correct; do not repeat stale samples.
            output.fill(0);
            return true;
        }

        if (this.ringBuffer.length >= want) {
            output.set(this.ringBuffer.subarray(0, want));
            this.ringBuffer = this.ringBuffer.subarray(want);
        } else {
            // Partial fill — copy what we have, pad remainder with silence.
            output.set(this.ringBuffer);
            output.fill(0, this.ringBuffer.length);
            this.ringBuffer = new Float32Array(0);
        }

        return true;
    }
}

registerProcessor("audio-data-worklet-stream", AudioDataWorkletStream);
