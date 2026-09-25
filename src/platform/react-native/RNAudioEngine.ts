import type { AudioEnginePort, AudioHandle, AudioMeter, PcmPlayback } from "@/ports/runtime/AudioEnginePort";
import type { MicrophonePort } from "@/ports/runtime/MicrophonePort";
import type { MediaStreamLike } from "@/ports/runtime/PeerConnectionPort";
import { RNPcmCapture } from "@/platform/react-native/RNPcmCapture";
import { RNPcmPlayback } from "@/platform/react-native/RNPcmPlayback";
import { AudioContext } from "react-native-audio-api";
import InCallManager from "react-native-incall-manager";

/**
 * O áudio não passa pelo motor aqui: quem toca a track remota e quem lê o microfone é o
 * nativo, então não há nada neste processo para medir. `null` diz exatamente isso — e é
 * diferente de medir silêncio.
 *
 * Quem preenche a lacuna é o transporte, com o `audioLevel` que o `getStats()` da conexão
 * já publica e o `RTCStatsAdapter` já coleta. Sai o nível que o próprio WebRTC vê.
 */
function unmeasuredMeter(stop: () => void): AudioMeter {
    return { level: () => null, spectrum: () => null, clipping: () => null, stop };
}

/**
 * O áudio de uma chamada oficial no React Native, que é quase todo trabalho do nativo: o
 * `react-native-webrtc` toca a track remota por conta própria, sem grafo de áudio nenhum.
 *
 * O que sobra, e não é pouco, é a **sessão de áudio do sistema**. Sem ela configurada o iOS
 * mantém a categoria `Ambient`, que obedece ao botão de silencioso: a chamada conecta, o
 * `inbound-rtp` conta pacotes, e o usuário não ouve nada. O `InCallManager` é quem acerta
 * isso, e é por isso que ele é dependência de par deste caminho e não um extra.
 *
 * O caminho do relay não passa por aqui: o runtime não declara `openSocket`, então o núcleo
 * recusa a chamada não oficial com `CALL_TYPE_UNSUPPORTED` antes de abri-la.
 */
export class RNAudioEngine implements AudioEnginePort {
    /** O nativo não informa a latência até o alto-falante. */
    readonly outputLatency = null;
    /** Quem toca é o sistema, e ele não pede gesto como o navegador. */
    readonly state = "running" as const;

    /**
     * O grafo só existe para a chamada não oficial, que é a única que precisa mexer em PCM
     * aqui. A oficial é toda do `react-native-webrtc`, e montar um `AudioContext` para ela
     * seria abrir hardware de áudio sem uso.
     */
    private context: AudioContext | null = null;

    async prepare(): Promise<void> {}
    async resume(): Promise<void> {}

    async suspend(): Promise<void> {}

    async close(): Promise<void> {
        InCallManager.stop();
        await this.context?.close();
        this.context = null;
    }

    /**
     * A track já está tocando; o que falta é dizer ao sistema que isto é uma chamada.
     *
     * Este é o momento exato de fazê-lo — quando a track remota chega, e não quando a conexão
     * abre. É o que a comunidade do `react-native-webrtc` apurou depois de casos de chamada
     * silenciosa no iOS: configurar antes disso o WebRTC nativo sobrescreve, e configurar
     * depois o áudio já saiu pela rota errada.
     */
    renderRemote(_stream: MediaStreamLike): AudioMeter {
        InCallManager.start({ media: "audio" });
        return unmeasuredMeter(() => InCallManager.stop());
    }

    monitorStream(_stream: MediaStreamLike): AudioMeter {
        return unmeasuredMeter(() => {});
    }

    /**
     * O microfone como PCM no formato do relay. A taxa do aparelho quase nunca é 16 kHz, e a
     * reamostragem acontece dentro do `RNPcmCapture`, em JavaScript — que é o que o Hermes
     * sabe rodar.
     */
    async capturePcm(_microphone: MicrophonePort, onFrame: (pcm: ArrayBuffer) => void): Promise<AudioHandle> {
        // O `AudioRecorder` é quem grava aqui, então o microfone do `react-native-webrtc` nem
        // é aberto: dois acessos nativos ao mesmo microfone é problema que não vale arriscar.
        const capture = new RNPcmCapture(onFrame);
        await capture.start();
        return capture;
    }

    playPcm(): PcmPlayback {
        return new RNPcmPlayback(this.audioContext());
    }

    /** Criado na primeira chamada não oficial, e não no construtor: abrir áudio custa. */
    private audioContext(): AudioContext {
        this.context ??= new AudioContext();
        return this.context;
    }
}
