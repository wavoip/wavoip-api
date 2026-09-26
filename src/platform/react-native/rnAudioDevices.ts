import type { AudioControl, AudioSelectionFailure } from "@/domain/audio/control";
import type { AudioDevice } from "@/domain/audio/device";
import { Result } from "@/domain/shared/Result";
import InCallManager from "react-native-incall-manager";
import { mediaDevices } from "react-native-webrtc";

/**
 * As duas saídas que um telefone realmente oferece numa chamada. São declaradas aqui em vez de
 * vir do `enumerateDevices`: o `react-native-webrtc` devolve `unknown` ali e não distingue
 * fone de alto-falante, e a escolha que um app de chamada faz é justamente essa — viva-voz ou
 * não. Quem executa a troca é o `InCallManager`.
 */
const EARPIECE: AudioDevice = { id: "earpiece", label: "Fone do aparelho", kind: "output" };
const SPEAKER: AudioDevice = { id: "speaker", label: "Viva-voz", kind: "output" };

/**
 * Os aparelhos de áudio no React Native.
 *
 * A entrada é lida do `enumerateDevices`, cujo retorno é `unknown` e vem do nativo — por isso
 * cada item é conferido antes de virar um `AudioDevice`. A lista chega de forma assíncrona e
 * fica guardada, porque a porta é síncrona: quem desenha uma interface lê o que já se sabe.
 *
 * Escolher a entrada não é possível: no Android e no iOS quem decide qual microfone usar é o
 * sistema, seguindo o que está conectado. A biblioteca diz isso com um código em vez de
 * aceitar a troca e não fazer nada.
 */
export class RNAudioDevices implements AudioControl {
    private inputs: AudioDevice[] = [];
    private output: AudioDevice = EARPIECE;

    constructor() {
        void this.refresh();
        // O `MediaDevices` do react-native-webrtc só declara o handler `on*`, e não o
        // `addEventListener` que o navegador tem.
        mediaDevices.ondevicechange = () => void this.refresh();
    }

    listInputDevices(): AudioDevice[] {
        return this.inputs;
    }

    listOutputDevices(): AudioDevice[] {
        return [EARPIECE, SPEAKER];
    }

    /** O sistema escolhe o microfone, e não informa qual. */
    get currentInput(): AudioDevice | null {
        return null;
    }

    get currentOutput(): AudioDevice {
        return this.output;
    }

    async selectInput(_id: string): Promise<Result<void, AudioSelectionFailure>> {
        return Result.fail("INPUT_SELECTION_UNSUPPORTED");
    }

    async selectOutput(id: string): Promise<Result<void, AudioSelectionFailure>> {
        if (id !== EARPIECE.id && id !== SPEAKER.id) {
            return Result.fail("AUDIO_DEVICE_NOT_FOUND", { details: { id } });
        }

        const toSpeaker = id === SPEAKER.id;
        InCallManager.setForceSpeakerphoneOn(toSpeaker);
        this.output = toSpeaker ? SPEAKER : EARPIECE;
        return Result.ok();
    }

    private async refresh(): Promise<void> {
        const listed = await mediaDevices.enumerateDevices().catch(() => []);
        this.inputs = Array.isArray(listed) ? listed.map(toInputDevice).filter(isPresent) : [];
    }
}

type NativeDevice = { deviceId?: unknown; label?: unknown; kind?: unknown };

function toInputDevice(entry: unknown): AudioDevice | null {
    const { deviceId, label, kind } = (entry ?? {}) as NativeDevice;
    if (typeof deviceId !== "string" || kind !== "audioinput") return null;
    return { id: deviceId, label: typeof label === "string" ? label : "", kind: "input" };
}

function isPresent(device: AudioDevice | null): device is AudioDevice {
    return device !== null;
}
