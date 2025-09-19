class AudioDataWorkletStream extends AudioWorkletProcessor {
    private uint8: Uint8Array = new Uint8Array(0);

    private offset = 0;

    constructor(options: AudioWorkletNodeOptions) {
        super(options);

        this.port.onmessage = this.appendBuffers.bind(this);
    }

    async appendBuffers({ data: { buffer } }: { data: { buffer: number[] } }) {
        const result = new Uint8Array(this.uint8.length + buffer.length);
        result.set(this.uint8, 0);
        result.set(buffer, this.uint8.length);

        this.uint8 = result;
        return true;
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
        const channels = outputs[0];

        if (this.offset >= this.uint8.length) {
            return true;
        }

        const uint8 = new Uint8Array(256);
        for (let i = 0; i < 256; i++, this.offset++) {
            if (this.offset >= this.uint8.length) {
                break;
            }
            uint8[i] = this.uint8[this.offset];
        }
        const uint16 = new Uint16Array(uint8.buffer);

        let sum = 0; // for volume

        for (let i = 0; i < uint16.length; i++) {
            const int = uint16[i];
            // If the high bit is on, then it is a negative number, and actually counts backwards.
            const float = int >= 0x8000 ? -(0x10000 - int) / 0x8000 : int / 0x7fff;
            // interleave

            channels[0][i] = float;

            // Volume calculation
            sum += float * float;
        }

        const volume = Math.sqrt(sum / uint16.length);

        this.port.postMessage({ volume });

        // Atraso de 25k bytes de pacotes, não vou zerar a quantidade de pacotes mas apenas diminuir o atraso
        if (this.uint8.length - this.offset > 25000) {
            this.offset += 10000;
        }

        // Retorna true para indicar que o processamento foi bem-sucedido.
        return true;
    }
}
registerProcessor("audio-data-worklet-stream", AudioDataWorkletStream);
