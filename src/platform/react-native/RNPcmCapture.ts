import { AdaptiveResampler } from "@/domain/audio/AdaptiveResampler";
import { Pcm } from "@/domain/audio/pcm";
import { RelayAudio } from "@/platform/react-native/RNPcmPlayback";
import type { AudioHandle } from "@/ports/runtime/AudioEnginePort";
import { AudioRecorder } from "react-native-audio-api";

/** 20 ms por bloco: menos que isso, o recorder do aparelho começa a perder frames. */
const PREFERRED_FRAMES = RelayAudio.rate / 50;

type RecordedBuffer = {
    sampleRate: number;
    numberOfChannels: number;
    getChannelData(channel: number): Float32Array;
};

/**
 * O microfone do aparelho como PCM no formato do relay.
 *
 * A taxa é pedida ao `AudioRecorder`, e num Galaxy A55 ele honra o que se pede — tanto os
 * 16 kHz da chamada quanto 48 kHz. Quando honra, o `AdaptiveResampler` devolve o bloco
 * intacto e não custa nada. Quando não honra, ele converte: medido neste aparelho, descer de
 * 48 para 16 kHz leva 3,78 ms por bloco de 20 ms, contra 0,07 ms no V8 — o Hermes interpreta
 * em vez de compilar. São 19% do orçamento, e só onde for preciso.
 *
 * A reamostragem de subida, que a reprodução precisaria, custa três vezes isso e é por isso
 * que ela não acontece em JavaScript: ver o `RNPcmPlayback`.
 */
export class RNPcmCapture implements AudioHandle {
    private readonly recorder = new AudioRecorder();
    private readonly resampler = new AdaptiveResampler(RelayAudio.rate);

    constructor(private readonly onFrame: (pcm: ArrayBuffer) => void) {}

    async start(): Promise<void> {
        this.recorder.onAudioReady(
            { sampleRate: RelayAudio.rate, bufferLength: PREFERRED_FRAMES, channelCount: 1 },
            (event) => this.deliver(event.buffer),
        );
        await this.recorder.start();
    }

    stop(): void {
        this.recorder.clearOnAudioReady();
        void this.recorder.stop();
        this.resampler.reset();
    }

    /** A taxa vem do bloco, e não do que pedimos: o aparelho pode mudá-la no meio da chamada. */
    private deliver(buffer: RecordedBuffer): void {
        const pcm = this.resampler.process(RNPcmCapture.monoOf(buffer), buffer.sampleRate);
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
    private static monoOf(buffer: RecordedBuffer): Int16Array {
        const first = buffer.getChannelData(0);
        if (buffer.numberOfChannels <= 1) return Pcm.toInt16(first);

        const mixed = new Float32Array(first.length);
        for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
            const samples = buffer.getChannelData(channel);
            for (let i = 0; i < mixed.length; i += 1) mixed[i] += samples[i] / buffer.numberOfChannels;
        }
        return Pcm.toInt16(mixed);
    }
}
