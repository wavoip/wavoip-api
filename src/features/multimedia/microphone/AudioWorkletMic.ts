import { ConverterType, create } from "@alexanderolsen/libsamplerate-js";
import type { SRC } from "@alexanderolsen/libsamplerate-js/dist/src";

class ResampleProcessor extends AudioWorkletProcessor {
    private src: SRC | null = null;
    private accumulated_PCM: number[] = [];

    constructor(options: AudioWorkletNodeOptions) {
        super(options);

        const nChannels = 1;
        const inputSampleRate = options.processorOptions?.sampleRate || 48000;
        const outputSampleRate = 16000;

        create(nChannels, inputSampleRate, outputSampleRate, {
            converterType: ConverterType.SRC_SINC_BEST_QUALITY, // or some other quality
        }).then((src) => {
            this.src = src;
        });
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][], _parameters: Record<string, Float32Array>) {
        // copy ins to outs (gross)
        for (let inputNum = 0; inputNum < inputs.length; inputNum++) {
            const input = inputs[inputNum];
            // copy channels
            for (let channelNum = 0; channelNum < input.length; channelNum++) {
                const channel = input[channelNum];
                // copy samples
                for (let sampleNum = 0; sampleNum < channel.length; sampleNum++) {
                    outputs[inputNum][channelNum][sampleNum] = channel[sampleNum];
                }
            }
        }

        // do something w.r.t. resampling
        if (this.src != null) {
            const resampled = this.src.full(inputs[0][0], null, null);

            // Converte o buffer resampleado para PCM e acumula
            const pcmData = this.convertToPCM(resampled);
            this.accumulated_PCM.push(...pcmData); // Acumula os dados PCM

            // Verifica se acumulou pelo menos 320 amostras (640 bytes)
            while (this.accumulated_PCM.length >= 320) {
                // Envia os primeiros 320 amostras (640 bytes)
                const dataToSend = this.accumulated_PCM.splice(0, 320); // Remove os dados enviados

                this.port.postMessage(new Int16Array(dataToSend).buffer); // Envia como ArrayBuffer
            }
        }

        return true;
    }

    convertToPCM(floatBuffer: Float32Array) {
        const pcmBuffer = new Int16Array(floatBuffer.length);
        for (let i = 0; i < floatBuffer.length; i++) {
            // Converte de ponto flutuante (-1.0 a 1.0) para inteiro de 16 bits (-32768 a 32767)
            pcmBuffer[i] = Math.max(-32768, Math.min(32767, Math.floor(floatBuffer[i] * 32767)));
        }
        return pcmBuffer; // Retorna o array PCM
    }
}

registerProcessor("resample-processor", ResampleProcessor);
