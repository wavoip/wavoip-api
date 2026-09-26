/** One 10 ms frame of the library's internal PCM: Int16, 16kHz, mono. */
export const FRAME_SAMPLES = 160;
export const SAMPLE_RATE = 16_000;

/**
 * Where the audio the far end hears comes from: a file, a TTS engine, a buffer your bot
 * fills.
 *
 * Push whatever your decoder already gives you — `Int16Array` or `Float32Array`, any sample
 * rate, mono or interleaved stereo — and declare the format below. The runtime converts,
 * downmixes and resamples; you never have to.
 *
 * Push whenever you have audio, in frames of any size. Silence is sent while you have none.
 */
export interface AudioSource {
    /** Defaults to 16000. Anything else is resampled. */
    readonly sampleRate?: number;
    /** Defaults to 1. Interleaved stereo is mixed down to mono. */
    readonly channelCount?: number;
    start(onFrame: (pcm: Int16Array | Float32Array) => void): void;
    stop(): void;
}

/** Where the far end's audio goes: a file, a recorder, a speech-to-text stream. */
export interface AudioSink {
    /** The rate you want to be written at. Defaults to 16000. */
    readonly sampleRate?: number;
    /** Int16 PCM, mono, at the rate above. */
    write(pcm: Int16Array): void;
    end(): void;
}
