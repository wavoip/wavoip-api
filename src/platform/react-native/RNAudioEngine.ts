import type { AudioEnginePort, AudioHandle, AudioMeter, PcmPlayback } from "@/ports/runtime/AudioEnginePort";
import type { MediaStreamLike } from "@/ports/runtime/PeerConnectionPort";

/**
 * Um medidor que ainda não mede: o react-native-webrtc não expõe o nível do áudio, e ler o
 * `getStats()` dele não serve porque o campo não está no contrato — seria adivinhação.
 *
 * Medir de verdade pede o `react-native-audio-api`, que é o mesmo pacote de que o relay vai
 * precisar. Até lá, `level()` devolve 0, e a matriz de plataformas no `docs/` diz isso —
 * chegar a zero por falta de implementação, e não por silêncio, é a única parte que o
 * integrador precisa saber.
 */
function unmeasuredMeter(stop: () => void): AudioMeter {
    return { level: () => 0, stop };
}

/**
 * O áudio de uma chamada oficial no React Native, que é quase todo trabalho do nativo.
 *
 * O react-native-webrtc toca o áudio que chega por conta própria, assim que a track entra na
 * conexão: não há alto-falante para abrir nem grafo de áudio a montar, e é por isso que este
 * motor é tão pequeno comparado ao do navegador.
 *
 * O caminho do relay (`capturePcm` e `playPcm`) não passa por aqui, porque o runtime do React
 * Native não declara `openSocket`: o `Wavoip` recusa a chamada não oficial antes de abri-la,
 * em vez de descobrir no meio que não sabe tratar PCM.
 */
export class RNAudioEngine implements AudioEnginePort {
    /** O nativo não informa a latência até o alto-falante. */
    readonly outputLatency = null;

    async prepare(): Promise<void> {}
    async resume(): Promise<void> {}
    async suspend(): Promise<void> {}
    async close(): Promise<void> {}

    /** Já está tocando: o nativo roteia a track remota para a saída do aparelho sozinho. */
    renderRemote(_stream: MediaStreamLike): AudioMeter {
        return unmeasuredMeter(() => {});
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
