import type { AudioDevice } from "@/domain/audio/device";
import type { MediaManager } from "@/modules/media/MediaManager";

/**
 * Os aparelhos de áudio que a biblioteca enxerga. Escolher o aparelho, testar o microfone
 * e controlar o volume entram aqui na DEV-526 PR H.
 */
export interface AudioControl {
    /** Every microphone the platform reports. Labels need microphone permission first. */
    listInputDevices(): AudioDevice[];
    listOutputDevices(): AudioDevice[];
    /** The microphone in use, or `null` before any call has opened one. */
    readonly currentInput: AudioDevice | null;
    readonly currentOutput: AudioDevice | null;
}

export function AudioControlProxy(media: MediaManager): AudioControl {
    const control = {
        listInputDevices: () => media.listDevices("input"),
        listOutputDevices: () => media.listDevices("output"),
    } as AudioControl;

    // Getters vivos: o aparelho em uso muda quando uma chamada abre o microfone ou quando
    // o sistema mexe na lista, e uma cópia ficaria parada no valor da construção.
    Object.defineProperties(control, {
        currentInput: { get: () => media.currentDevice("input"), enumerable: true },
        currentOutput: { get: () => media.currentDevice("output"), enumerable: true },
    });

    return control;
}
