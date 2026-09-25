/** One 10 ms frame of the library's PCM: Int16, 16kHz, mono. */
export const FRAME_SAMPLES = 160;
export const SAMPLE_RATE = 16_000;

/**
 * Where the audio the far end hears comes from: a file, a TTS engine, a buffer your bot
 * fills. Push frames of Int16 PCM at 16kHz — any size, the runtime re-slices them into the
 * 10 ms frames WebRTC wants.
 *
 * Push whatever you have, whenever you have it. Silence is sent while you have nothing.
 */
export interface AudioSource {
    start(onFrame: (pcm: Int16Array) => void): void;
    stop(): void;
}

/** Where the far end's audio goes: a file, a recorder, a speech-to-text stream. */
export interface AudioSink {
    /** Int16 PCM at 16kHz, mono. */
    write(pcm: Int16Array): void;
    end(): void;
}
