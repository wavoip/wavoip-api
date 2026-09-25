import type { AudioEnginePort, AudioHandle, AudioMeter, PcmPlayback } from "@/ports/runtime/AudioEnginePort";
import type { MediaStreamLike } from "@/ports/runtime/PeerConnectionPort";
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
    return { level: () => null, stop };
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

    async prepare(): Promise<void> {}
    async resume(): Promise<void> {}
    async suspend(): Promise<void> {}

    async close(): Promise<void> {
        InCallManager.stop();
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

    capturePcm(_stream: MediaStreamLike, _onFrame: (pcm: ArrayBuffer) => void): AudioHandle {
        throw new Error(RELAY_UNSUPPORTED);
    }

    playPcm(): PcmPlayback {
        throw new Error(RELAY_UNSUPPORTED);
    }
}

const RELAY_UNSUPPORTED =
    "o runtime do React Native ainda não trata PCM, que a chamada não oficial exige: " +
    "use um device com chamada OFICIAL, ou acompanhe a DEV-277";
