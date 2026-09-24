/**
 * Reads one direction of a call's audio. Today it reports the level; waveform and spectrum
 * fit here later, and work for both directions at once.
 */
export type AudioAnalyser = {
    /** The audio level right now, from 0 to 1. Synchronous, for a `requestAnimationFrame`. */
    level(): number;
};

export type CallAudio = {
    /** What comes in from the peer. */
    readonly in: AudioAnalyser;
    /** What goes out from the microphone. */
    readonly out: AudioAnalyser;
};
