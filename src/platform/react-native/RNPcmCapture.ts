import { Pcm } from "@/domain/audio/pcm";
import { RelayAudio } from "@/platform/react-native/RNPcmPlayback";
import type { AudioHandle } from "@/ports/runtime/AudioEnginePort";
import { AudioRecorder } from "react-native-audio-api";

/** 20 ms por bloco: menos que isso, o recorder do aparelho começa a perder frames. */
const PREFERRED_FRAMES = RelayAudio.rate / 50;
/** O gravador entrega a cada 20 ms; passou disto, ele não vai entregar. */
const FIRST_BLOCK_MS = 2_000;

type RecordedBuffer = {
    sampleRate: number;
    numberOfChannels: number;
    getChannelData(channel: number): Float32Array;
};

/**
 * O microfone do aparelho como PCM no formato do relay.
 *
 * Não há reamostragem aqui: a taxa é pedida ao `AudioRecorder` e ele a honra — medido num
 * Galaxy A55, que entregou tanto os 16 kHz da chamada quanto 48 kHz, conforme o que se pediu.
 * Fazer a conversão em JavaScript custaria caro: o mesmo reamostrador leva 0,2 ms por bloco no
 * V8 e 11,8 ms no Hermes, que interpreta em vez de compilar.
 *
 * Se algum aparelho entregar outra taxa, a captura falha dizendo qual. Seguir adiante daria
 * voz acelerada ou arrastada, e uma chamada que não conecta é melhor que uma incompreensível.
 */
export class RNPcmCapture implements AudioHandle {
    private readonly recorder = new AudioRecorder();
    private announceRate: ((rate: number) => void) | null = null;

    constructor(private readonly onFrame: (pcm: ArrayBuffer) => void) {}

    async start(): Promise<void> {
        const delivered = this.firstDeliveredRate();
        this.recorder.onAudioReady(
            { sampleRate: RelayAudio.rate, bufferLength: PREFERRED_FRAMES, channelCount: 1 },
            (event) => this.deliver(event.buffer),
        );
        await this.recorder.start();

        const rate = await delivered;
        if (rate === RelayAudio.rate) return;

        this.stop();
        throw new RangeError(`o aparelho gravou em ${rate} Hz, e a chamada fala ${RelayAudio.rate} Hz mono`);
    }

    stop(): void {
        this.announceRate = null;
        this.recorder.clearOnAudioReady();
        void this.recorder.stop();
    }

    /** A taxa do primeiro bloco, ou uma falha se o gravador não entregar bloco nenhum. */
    private firstDeliveredRate(): Promise<number> {
        return new Promise((resolve, reject) => {
            const giveUp = setTimeout(() => {
                this.stop();
                reject(new Error(`o microfone não entregou áudio nenhum em ${FIRST_BLOCK_MS} ms`));
            }, FIRST_BLOCK_MS);

            this.announceRate = (rate) => {
                clearTimeout(giveUp);
                this.announceRate = null;
                resolve(rate);
            };
        });
    }

    /**
     * O bloco fora da taxa é descartado, e não convertido: o `start` já falhou por ele, e
     * entregá-lo depois disso seria justamente o áudio torto que a falha existe para evitar.
     */
    private deliver(buffer: RecordedBuffer): void {
        this.announceRate?.(buffer.sampleRate);
        if (buffer.sampleRate !== RelayAudio.rate) return;

        const pcm = RNPcmCapture.monoOf(buffer);
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
