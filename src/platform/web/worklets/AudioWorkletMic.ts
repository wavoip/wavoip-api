class ResampleProcessor extends AudioWorkletProcessor {
    private src: { full: (input: Float32Array) => Float32Array } | null = null;
    private accumulated = new Int16Array(0);

    constructor(options: AudioWorkletNodeOptions) {
        super(options);
        this.init();
    }

    async init() {
        //@ts-expect-error
        const { create, ConverterType } = globalThis.LibSampleRate;

        const nChannels = 1;
        const inputSampleRate = sampleRate;
        const outputSampleRate = 16000;

        this.src = await create(nChannels, inputSampleRate, outputSampleRate, {
            converterType: ConverterType.SRC_SINC_BEST_QUALITY,
        });
    }

    process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Record<string, Float32Array>) {
        const input = inputs[0]?.[0];
        if (!input || !this.src) return true;

        const resampled = this.src.full(input);
        if (!resampled || resampled.length === 0) return true;

        const pcm = this.floatToPCM(resampled);

        const merged = new Int16Array(this.accumulated.length + pcm.length);
        merged.set(this.accumulated);
        merged.set(pcm, this.accumulated.length);
        this.accumulated = merged;

        while (this.accumulated.length >= 320) {
            const frame = this.accumulated.slice(0, 320);
            this.accumulated = this.accumulated.subarray(320);
            this.port.postMessage(frame.buffer, [frame.buffer]);
        }

        return true;
    }

    private floatToPCM(floatBuffer: Float32Array): Int16Array {
        const pcm = new Int16Array(floatBuffer.length);
        for (let i = 0; i < floatBuffer.length; i++) {
            const s = floatBuffer[i];
            pcm[i] = s < 0 ? Math.max(-32768, s * 32768) : Math.min(32767, s * 32767);
        }
        return pcm;
    }
}

registerProcessor("resample-processor", ResampleProcessor);
