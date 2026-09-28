import type { AudioDevice } from "@/domain/audio/device";
import type { WavoipError } from "@/domain/shared/errors";
import type { Result } from "@/domain/shared/Result";

/** Why choosing a device did not happen. */
export type AudioSelectionFailure = WavoipError<
    "AUDIO_DEVICE_NOT_FOUND" | "OUTPUT_SELECTION_UNSUPPORTED" | "INPUT_SELECTION_UNSUPPORTED"
>;

/** The audio devices the library can see, and which of them to use. */
export interface AudioControl {
    /** Every microphone the platform reports. Labels need microphone permission first. */
    listInputDevices(): AudioDevice[];
    listOutputDevices(): AudioDevice[];
    /** The microphone in use, or `null` before any call has opened one. */
    readonly currentInput: AudioDevice | null;
    readonly currentOutput: AudioDevice | null;
    /**
     * Switches the microphone, by the `id` of one the list reported. Takes effect on the
     * running call: the track is swapped, so there is no need to hang up.
     */
    selectInput(id: string): Promise<Result<void, AudioSelectionFailure>>;
    /**
     * Switches where the call is heard, by the `id` of one the list reported. On a phone this
     * is how you turn the speaker on and off.
     */
    selectOutput(id: string): Promise<Result<void, AudioSelectionFailure>>;
}
