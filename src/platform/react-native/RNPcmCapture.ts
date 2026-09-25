import { SincResampler } from "@/domain/audio/SincResampler";
import { Pcm } from "@/domain/audio/pcm";
import type { AudioHandle } from "@/ports/runtime/AudioEnginePort";
import { AudioRecorder } from "react-native-audio-api";

/** O formato que a chamada não oficial fala, dos dois lados do relay. */
const CALL_RATE = 16_000;
/** 20 ms por bloco: menos que isso, o recorder do aparelho começa a perder frames. */
const PREFERRED_FRAMES = CALL_RATE / 50;

/**
 * O microfone do aparelho como PCM no formato do relay.
 *
 * O `AudioRecorder` entrega Float32 na taxa que o aparelho quiser — a taxa pedida é uma
 * preferência, e a documentação dele avisa que pode variar. Então a taxa real é lida de cada
 * buffer, e o reamostrador é montado quando o primeiro chega, e não antes.
 *
 * É esse reamostrador que faltava para a chamada não oficial rodar aqui, e ele é JavaScript
 * puro: o Hermes não tem WebAssembly, e uma biblioteca compilada não serviria.
 */
export class RNPcmCapture implements AudioHandle {
    private readonly recorder = new AudioRecorder();
    private resampler: SincResampler | null = null;
    private sourceRate = 0;

    constructor(private readonly onFrame: (pcm: ArrayBuffer) => void) {}

    async start(): Promise<void> {
        this.recorder.onAudioReady(
            { sampleRate: CALL_RATE, bufferLength: PREFERRED_FRAMES, channelCount: 1 },
            (event) => this.deliver(event.buffer),
        );
        await this.recorder.start();
    }

    stop(): void {
        this.recorder.clearOnAudioReady();
        void this.recorder.stop();
        this.resampler = null;
    }

    private deliver(buffer: {
        sampleRate: number;
        numberOfChannels: number;
        getChannelData(c: number): Float32Array;
    }): void {
        const pcm = this.resamplerFor(buffer.sampleRate).process(RNPcmCapture.monoOf(buffer));
        if (pcm.length > 0) this.onFrame(pcm.buffer as ArrayBuffer);
    }

    /**
     * Os canais deste `AudioBuffer` vêm separados, e não intercalados como num arquivo: cada
     * um é um array próprio. Por isso a mistura é feita aqui, somando posição a posição, em
     * vez de pelo `Pcm.downmix`, que espera as amostras alternando entre os canais.
     *
     * Pedimos mono ao gravador, mas o aparelho pode entregar dois — e aí ficar só com o
     * primeiro jogaria fora metade do que o microfone captou.
     */
    private static monoOf(buffer: { numberOfChannels: number; getChannelData(c: number): Float32Array }): Int16Array {
        const first = buffer.getChannelData(0);
        if (buffer.numberOfChannels <= 1) return Pcm.toInt16(first);

        const mixed = new Float32Array(first.length);
        for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
            const samples = buffer.getChannelData(channel);
            for (let i = 0; i < mixed.length; i += 1) mixed[i] += samples[i] / buffer.numberOfChannels;
        }
        return Pcm.toInt16(mixed);
    }

    /** A taxa vem do aparelho, não do que pedimos: trocá-la no meio recomeça a emenda. */
    private resamplerFor(rate: number): SincResampler {
        if (!this.resampler || this.sourceRate !== rate) {
            this.sourceRate = rate;
            this.resampler = new SincResampler(rate, CALL_RATE);
        }
        return this.resampler;
    }
}
