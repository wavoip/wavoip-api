import type { AudioControl, AudioDevice } from "@/index";
import { mediaDevices } from "react-native-webrtc";

/**
 * Os aparelhos de áudio que o sistema lista. O `enumerateDevices` do react-native-webrtc
 * devolve `unknown`, e o formato real vem do nativo — por isso cada item é conferido antes de
 * virar um `AudioDevice`, em vez de confiar num cast.
 *
 * A lista é lida de forma assíncrona e guardada, porque a porta é síncrona: quem desenha uma
 * interface lê o que já se sabe, sem esperar.
 */
export class RNAudioDevices implements AudioControl {
    private devices: AudioDevice[] = [];

    constructor() {
        void this.refresh();
        // O `MediaDevices` do react-native-webrtc só declara o handler `on*`, e não o
        // `addEventListener` que o navegador tem.
        mediaDevices.ondevicechange = () => void this.refresh();
    }

    listInputDevices(): AudioDevice[] {
        return this.devices.filter((device) => device.kind === "input");
    }

    listOutputDevices(): AudioDevice[] {
        return this.devices.filter((device) => device.kind === "output");
    }

    /** O aparelho em uso é decisão do sistema no React Native, e ele não a informa. */
    get currentInput(): AudioDevice | null {
        return null;
    }

    get currentOutput(): AudioDevice | null {
        return null;
    }

    private async refresh(): Promise<void> {
        const listed = await mediaDevices.enumerateDevices().catch(() => []);
        this.devices = Array.isArray(listed) ? listed.map(toAudioDevice).filter(isPresent) : [];
    }
}

type NativeDevice = { deviceId?: unknown; label?: unknown; kind?: unknown };

function toAudioDevice(entry: unknown): AudioDevice | null {
    const { deviceId, label, kind } = (entry ?? {}) as NativeDevice;
    if (typeof deviceId !== "string" || typeof kind !== "string") return null;

    if (kind === "audioinput") return { id: deviceId, label: asLabel(label), kind: "input" };
    if (kind === "audiooutput") return { id: deviceId, label: asLabel(label), kind: "output" };
    return null;
}

function asLabel(label: unknown): string {
    return typeof label === "string" ? label : "";
}

function isPresent(device: AudioDevice | null): device is AudioDevice {
    return device !== null;
}
