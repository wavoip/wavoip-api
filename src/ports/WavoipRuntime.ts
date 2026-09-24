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
    /** Absent on a platform without WebRTC: official calls are unavailable there. */
    readonly createPeer?: PeerConnectionFactory;
    /** Absent on a platform without a binary socket: unofficial calls are unavailable there. */
    readonly openSocket?: MediaSocketFactory;
}
