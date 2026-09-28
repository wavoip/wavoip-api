/** Reads one direction of a call's audio. Both readings are synchronous, for a frame loop. */
export type AudioAnalyser = {
    /** The audio level right now, from 0 to 1. */
    level(): number;
    /**
     * The frequency spectrum right now: one byte per band, from 0 to 255, low to high. Draw
     * it as bars and you get a waveform display.
     *
     * Empty only where the audio never reaches this process: on React Native the system plays
     * the call natively, so there is nothing here to analyse. The browser and Node both fill
     * it. Check `length` before drawing.
     */
    spectrum(): Uint8Array;
    /**
     * How much of this audio is clipping, from 0 to 1: the share of samples pinned at the
     * ceiling over the last second or so.
     *
     * Above a few percent it is audible as harshness, and no volume control fixes it — what
     * was clipped is gone. On the way out it means the microphone gain is too high, in the
     * system or on the device itself; on the way in it means the audio arrived that way.
     * Show it, so the person can lower the gain.
     *
     * Reads `0` where the platform cannot see the audio, the same as `spectrum()` returning
     * empty.
     */
    clipping(): number;
};

export type CallAudio = {
    /** What comes in from the peer. */
    readonly in: AudioAnalyser;
    /** What goes out from the microphone. */
    readonly out: AudioAnalyser;
};
