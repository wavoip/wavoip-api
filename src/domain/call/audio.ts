/** Reads one direction of a call's audio. Both readings are synchronous, for a frame loop. */
export type AudioAnalyser = {
    /** The audio level right now, from 0 to 1. */
    level(): number;
    /**
     * The frequency spectrum right now: one byte per band, from 0 to 255, low to high. Draw
     * it as bars and you get a waveform display.
     *
     * Empty where the platform cannot see the audio — React Native plays the call through
     * the system, so nothing passes through this process to analyse. Check `length` before
     * drawing.
     */
    spectrum(): Uint8Array;
};

export type CallAudio = {
    /** What comes in from the peer. */
    readonly in: AudioAnalyser;
    /** What goes out from the microphone. */
    readonly out: AudioAnalyser;
};
