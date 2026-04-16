const INPUT_RATE = 16_000;
const JITTER_MAX_BYTES = 25_000;
const JITTER_DROP_BYTES = 10_000;

class AudioDataWorkletStream extends AudioWorkletProcessor {
    private src: { full: (input: Float32Array) => Float32Array } | null = null;

    // Incoming raw bytes (Int16 PCM at 16kHz)
    private chunks: Uint8Array[] = [];
    private totalBytes = 0;
    private current: Uint8Array | null = null;
    private currentOffset = 0;

    // Resampled Float32 samples at native rate, ready for process()
    private outBuffer = new Float32Array(0);
    private outOffset = 0;

    constructor(options: AudioWorkletNodeOptions) {
        super(options);
        this.port.onmessage = this.onMessage.bind(this);
        this.initResampler();
    }

    private async initResampler(): Promise<void> {
        //@ts-expect-error
        const { create, ConverterType } = globalThis.LibSampleRate;

        this.src = await create(1, INPUT_RATE, sampleRate, {
            converterType: ConverterType.SRC_SINC_BEST_QUALITY,
        });
    }

    private onMessage(event: MessageEvent): void {
        if (event.data?.type === "clear") {
            this.chunks = [];
            this.current = null;
            this.currentOffset = 0;
            this.totalBytes = 0;
            this.outBuffer = new Float32Array(0);
            this.outOffset = 0;
            return;
        }

        const buffer = event.data as ArrayBuffer;
        const chunk = new Uint8Array(buffer);
        this.chunks.push(chunk);
        this.totalBytes += chunk.length;

        // Jitter: if too far behind, skip ahead
        while (this.remainingBytes() > JITTER_MAX_BYTES) {
            this.skip(JITTER_DROP_BYTES);
        }

        this.drainAndResample();
    }

    /**
     * Read all available Int16 PCM bytes, decode to Float32,
     * resample 16kHz → native, and append to outBuffer.
     */
    private drainAndResample(): void {
        if (!this.src) return;

        // Read all available bytes as Int16 pairs
        const available = this.remainingBytes();
        const sampleCount = available >> 1; // 2 bytes per Int16 sample
        if (sampleCount === 0) return;

        const raw = new Uint8Array(sampleCount * 2);
        for (let i = 0; i < raw.length; i++) {
            const byte = this.readByte();
            if (byte === -1) break;
            raw[i] = byte;
        }

        // Int16 PCM → Float32
        const int16 = new Uint16Array(raw.buffer);
        const decoded = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
            const val = int16[i];
            decoded[i] = val >= 0x8000 ? -(0x10000 - val) / 0x8000 : val / 0x7FFF;
        }

        // Resample 16kHz → native rate
        const resampled = this.src.full(decoded);
        if (!resampled || resampled.length === 0) return;

        // Append to output buffer (preserving unconsumed tail)
        const remaining = this.outBuffer.length - this.outOffset;
        const newOut = new Float32Array(remaining + resampled.length);
        if (remaining > 0) {
            newOut.set(this.outBuffer.subarray(this.outOffset));
        }
        newOut.set(resampled, remaining);
        this.outBuffer = newOut;
        this.outOffset = 0;
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
        const output = outputs[0]?.[0];
        if (!output) return true;

        const available = this.outBuffer.length - this.outOffset;

        if (available >= output.length) {
            output.set(this.outBuffer.subarray(this.outOffset, this.outOffset + output.length));
            this.outOffset += output.length;
        } else {
            if (available > 0) {
                output.set(this.outBuffer.subarray(this.outOffset, this.outOffset + available));
            }
            output.fill(0, available);
            this.outOffset = this.outBuffer.length;
        }

        // Reclaim when fully consumed
        if (this.outOffset >= this.outBuffer.length) {
            this.outBuffer = new Float32Array(0);
            this.outOffset = 0;
        }

        return true;
    }

    private readByte(): number {
        while (true) {
            if (this.current && this.currentOffset < this.current.length) {
                return this.current[this.currentOffset++];
            }

            const next = this.chunks.shift();
            if (!next) {
                this.current = null;
                this.currentOffset = 0;
                return -1;
            }

            this.totalBytes -= next.length;
            this.current = next;
            this.currentOffset = 0;
        }
    }

    private remainingBytes(): number {
        const inCurrent = this.current ? this.current.length - this.currentOffset : 0;
        return this.totalBytes + inCurrent;
    }

    private skip(bytes: number): void {
        let toSkip = bytes;
        while (toSkip > 0) {
            if (this.current && this.currentOffset < this.current.length) {
                const available = this.current.length - this.currentOffset;
                const s = Math.min(toSkip, available);
                this.currentOffset += s;
                toSkip -= s;
            } else {
                const next = this.chunks.shift();
                if (!next) break;
                this.totalBytes -= next.length;
                this.current = next;
                this.currentOffset = 0;
            }
        }
    }
}

registerProcessor("audio-data-worklet-stream", AudioDataWorkletStream);
