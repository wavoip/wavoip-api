import type { AudioControl } from "@/domain/audio/control";
import type { AudioEnginePort } from "@/ports/runtime/AudioEnginePort";
import type { MediaSocketFactory } from "@/ports/runtime/MediaSocketPort";
import type { MicrophonePort } from "@/ports/runtime/MicrophonePort";
import type { PeerConnectionFactory } from "@/ports/runtime/PeerConnectionPort";

/**
 * Everything the library needs from the platform it runs on, in one bundle. The core
 * builds none of it: a runtime is handed to `new Wavoip({ runtime })`, and each platform
 * ships its own.
 */
export interface WavoipRuntime {
    /** Plays, captures and measures audio. */
    readonly engine: AudioEnginePort;
    /** Opens and closes the local audio input shared by every call. */
    readonly microphone: MicrophonePort;
    /** The audio devices this platform can see. */
    readonly audio: AudioControl;
    /**
     * Whether the audio comes from devices the system lists, instead of from something the
     * integrator hands over.
     *
     * `true` in a browser and on a phone: an empty device list there means no microphone is
     * plugged in, and without one there is no call. `false` on a headless host, where the
     * audio is the `source` you passed in — there is no hardware to enumerate, and an empty
     * list says nothing about whether a call can happen.
     *
     * The diagnostics read this instead of guessing from the list itself.
     */
    readonly usesAudioDevices: boolean;
    /** Absent on a platform without WebRTC: official calls are unavailable there. */
    readonly createPeer?: PeerConnectionFactory;
    /** Absent on a platform without a binary socket: unofficial calls are unavailable there. */
    readonly openSocket?: MediaSocketFactory;
}
