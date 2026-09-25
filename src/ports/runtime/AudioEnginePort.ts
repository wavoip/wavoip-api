import type { MediaStreamLike } from "@/ports/runtime/PeerConnectionPort";

/** Everything the engine opens is closed through its own handle. */
export interface AudioHandle {
    stop(): void;
}

/**
 * A handle that also measures what flows through it, from 0 to 1.
 *
 * `null` means this platform does not measure here — which is not the same as measuring
 * silence. React Native is the case: playback is the system's job and never passes through
 * the engine, so the level comes from the connection's own statistics instead.
 */
export interface AudioMeter extends AudioHandle {
    level(): number | null;
    /**
     * The frequency bands of what flows through, or `null` where this platform cannot see
     * the audio. Same rule as `level`: `null` is "not measured", not "silent".
     */
    spectrum(): Uint8Array | null;
}

/** Playback of the PCM arriving over the relay. */
export interface PcmPlayback extends AudioHandle {
    write(pcm: ArrayBuffer): void;
    /**
     * How much audio has arrived and has not played yet, in milliseconds. `null` until the
     * first measurement, or on a platform that does not measure it.
     */
    bufferedMs(): number | null;
}

/**
 * The platform's audio engine: on the web an `AudioContext` with worklets, on React Native
 * the native module, on a headless Node whatever the integrator plugs in. Callers never
 * learn which one they got.
 *
 * The PCM in and out of here is Int16 at 16kHz, which is the relay's format.
 */
/**
 * Se o motor está tocando, parado ou fechado.
 *
 * `suspended` depois de um `resume()` é o sinal de que a plataforma está segurando o áudio à
 * espera de um gesto da pessoa — o navegador faz isso —, e não de que algo quebrou.
 */
export type AudioEngineState = "running" | "suspended" | "closed";

export interface AudioEnginePort {
    readonly state: AudioEngineState;
    /**
     * Seconds between the audio engine and the speaker, or `null` where the platform does
     * not report it (Safari does not implement `outputLatency`). Becomes `latency.playout_ms`.
     *
     * Excludes audio still waiting in the playback queue: that is `PcmPlayback.bufferedMs`.
     */
    readonly outputLatency: number | null;
    /** Loads whatever must be ready before audio can flow; on the web, the worklets. */
    prepare(): Promise<void>;
    resume(): Promise<void>;
    suspend(): Promise<void>;
    close(): Promise<void>;
    /**
     * Do with the far end's audio whatever this platform does with it: play it on the web,
     * write it to the sink on a headless host. Measures the level either way.
     */
    renderRemote(stream: MediaStreamLike): AudioMeter;
    /** Measures the microphone without routing it back to the speaker. */
    monitorStream(stream: MediaStreamLike): AudioMeter;
    /**
     * Feeds the microphone through the resampler and hands over each PCM frame ready for
     * the relay. Does not measure: the relay's level comes from the PCM itself.
     */
    capturePcm(stream: MediaStreamLike, onFrame: (pcm: ArrayBuffer) => void): AudioHandle;
    playPcm(): PcmPlayback;
}
