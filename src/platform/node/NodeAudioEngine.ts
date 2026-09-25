import { rmsInt16 } from "@/modules/media/audio-level";
import type { AudioSink } from "@/platform/node/audioIo";
import type { SharedAudioSource } from "@/platform/node/SharedAudioSource";
import type { AudioEnginePort, AudioHandle, AudioMeter, PcmPlayback } from "@/ports/runtime/AudioEnginePort";
import type { MediaStreamLike } from "@/ports/runtime/PeerConnectionPort";
import { nonstandard, type RTCAudioData } from "@/platform/node/wrtc";

/** Um medidor que acompanha o último PCM visto, com o `stop` de quem o alimenta. */
function meterOf(readLevel: () => number, stop: () => void): AudioMeter {
    return { level: readLevel, stop };
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

    /** O áudio que chega do WebRTC vai para o sumidouro do integrador. */
    renderRemote(stream: MediaStreamLike): AudioMeter {
        let level = 0;
        const audioSink = new nonstandard.RTCAudioSink(trackOf(stream));

        audioSink.ondata = ({ samples }: RTCAudioData) => {
            level = rmsInt16(samples.buffer as ArrayBuffer);
            this.sink.write(samples);
        };

        return meterOf(
            () => level,
            () => audioSink.stop(),
        );
    }

    /** Mede o que sai para o outro lado, sem duplicar a entrega. */
    monitorStream(_stream: MediaStreamLike): AudioMeter {
        let level = 0;
        const stop = this.source.subscribe((pcm) => {
            level = rmsInt16(pcm.buffer as ArrayBuffer);
        });
        return meterOf(() => level, stop);
    }

    /** O caminho do relay: o PCM do integrador sai cru, sem passar por track nenhuma. */
    capturePcm(_stream: MediaStreamLike, onFrame: (pcm: ArrayBuffer) => void): AudioHandle {
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
