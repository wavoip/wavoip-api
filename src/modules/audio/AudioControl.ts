import type { AudioDevice } from "@/domain/audio/device";

/** The audio devices the library can see. */
export interface AudioControl {
    /** Every microphone the platform reports. Labels need microphone permission first. */
    listInputDevices(): AudioDevice[];
    listOutputDevices(): AudioDevice[];
    /** The microphone in use, or `null` before any call has opened one. */
    readonly currentInput: AudioDevice | null;
    readonly currentOutput: AudioDevice | null;
}
