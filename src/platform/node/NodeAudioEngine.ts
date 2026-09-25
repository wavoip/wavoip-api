import { ClipDetector } from "@/domain/audio/ClipDetector";
import { AdaptiveResampler } from "@/domain/audio/AdaptiveResampler";
import { SpectrumAnalyser } from "@/domain/audio/SpectrumAnalyser";
import { rmsInt16 } from "@/modules/media/audio-level";
import type { AudioSink } from "@/platform/node/audioIo";
import type { SharedAudioSource } from "@/platform/node/SharedAudioSource";
import type { AudioEnginePort, AudioHandle, AudioMeter, PcmPlayback } from "@/ports/runtime/AudioEnginePort";
import type { MicrophonePort } from "@/ports/runtime/MicrophonePort";
import type { MediaStreamLike } from "@/ports/runtime/PeerConnectionPort";

/** O que a biblioteca fala por dentro, e o que o sumidouro do integrador espera receber. */
const CALL_RATE = 16_000;
import { nonstandard, type RTCAudioData } from "@/platform/node/wrtc";

/**
 * Um medidor do PCM que passa: nível a cada frame, espectro só quando alguém pede.
 *
 * O áudio realmente atravessa este processo, então há o que analisar — diferente do React
 * Native, onde o nativo toca sem passar por aqui. A FFT fica atrás do `bands()`: quem nunca
 * chama `spectrum()` não paga por ela.
 */
function meterOf(
    readLevel: () => number,
    analyser: SpectrumAnalyser,
    clip: ClipDetector,
    stop: () => void,
): AudioMeter {
    return { level: readLevel, spectrum: () => analyser.bands(), clipping: () => clip.fraction, stop };
}

/**
 * O motor de áudio de um Node sem cabeça. Não existe alto-falante aqui: o áudio do outro
 * lado é entregue ao `AudioSink` do integrador, que decide se grava em arquivo, manda para
 * um STT ou descarta.
 *
 * O formato é o mesmo dos dois lados — Int16 a 16kHz, o que o relay fala e o que o
 * `RTCAudioSource` aceita —, então aqui não há reamostragem nenhuma.
 */
export class NodeAudioEngine implements AudioEnginePort {
    /** Não há alto-falante para medir. */
    readonly outputLatency = null;
    /** Nada segura o áudio num processo sem tela: ele está pronto desde que existe. */
    readonly state = "running" as const;

    constructor(
        private readonly source: SharedAudioSource,
        private readonly sink: AudioSink,
    ) {}

    async prepare(): Promise<void> {}
    async resume(): Promise<void> {}
    async suspend(): Promise<void> {}

    async close(): Promise<void> {
        this.sink.end();
    }

    /**
     * O áudio que chega do WebRTC vai para o sumidouro do integrador, na taxa da chamada.
     *
     * A taxa é lida de cada bloco, e não presumida: o `RTCAudioSink` entrega no que o
     * decodificador estiver usando — 48 kHz, na prática, e não os 16 kHz que a biblioteca
     * fala por dentro. Tratar 48 kHz como 16 kHz fazia a gravação sair com o triplo da
     * duração da chamada, e o áudio grave e arrastado.
     */
    renderRemote(stream: MediaStreamLike): AudioMeter {
        let level = 0;
        const analyser = new SpectrumAnalyser();
        const clip = new ClipDetector();
        const toCallRate = new AdaptiveResampler(CALL_RATE);
        const audioSink = new nonstandard.RTCAudioSink(trackOf(stream));

        audioSink.ondata = ({ samples, sampleRate }: RTCAudioData) => {
            const pcm = toCallRate.process(samples, sampleRate);
            if (pcm.length === 0) return;

            level = rmsInt16(pcm.buffer as ArrayBuffer);
            analyser.push(pcm);
            clip.push(pcm);
            this.sink.write(pcm);
        };

        return meterOf(
            () => level,
            analyser,
            clip,
            () => audioSink.stop(),
        );
    }

    /** Mede o que sai para o outro lado, sem duplicar a entrega. */
    monitorStream(_stream: MediaStreamLike): AudioMeter {
        let level = 0;
        const analyser = new SpectrumAnalyser();
        const clip = new ClipDetector();
        const stop = this.source.subscribe((pcm) => {
            level = rmsInt16(pcm.buffer as ArrayBuffer);
            analyser.push(pcm);
            clip.push(pcm);
        });
        return meterOf(() => level, analyser, clip, stop);
    }

    /** O caminho do relay: o PCM do integrador sai cru, sem passar por microfone nenhum. */
    async capturePcm(_microphone: MicrophonePort, onFrame: (pcm: ArrayBuffer) => void): Promise<AudioHandle> {
        const stop = this.source.subscribe((pcm) => onFrame(copyOf(pcm)));
        return { stop };
    }

    /** O caminho do relay na volta: o PCM que chega vai direto ao sumidouro. */
    playPcm(): PcmPlayback {
        return {
            write: (pcm) => this.sink.write(new Int16Array(pcm)),
            // Nada espera: o sumidouro é do integrador e consome na hora.
            bufferedMs: () => 0,
            stop: () => {},
        };
    }
}

function trackOf(stream: MediaStreamLike): MediaStreamTrack {
    const [track] = stream.getAudioTracks();
    if (!track) throw new Error(`o stream remoto chegou sem track de áudio: ${JSON.stringify(stream.getTracks())}`);
    return track as unknown as MediaStreamTrack;
}

/** O `samples` do wrtc é reaproveitado entre callbacks: quem guarda precisa da própria cópia. */
function copyOf(pcm: Int16Array): ArrayBuffer {
    return pcm.slice().buffer as ArrayBuffer;
}
