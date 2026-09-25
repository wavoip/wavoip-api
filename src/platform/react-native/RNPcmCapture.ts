import { Pcm } from "@/domain/audio/pcm";
import { SincResampler } from "@/domain/audio/SincResampler";
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
        const mono = Pcm.downmix(Pcm.toInt16(buffer.getChannelData(0)), 1);
        const pcm = this.resamplerFor(buffer.sampleRate).process(mono);
        if (pcm.length > 0) this.onFrame(pcm.buffer as ArrayBuffer);
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
