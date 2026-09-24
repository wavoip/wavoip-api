/** A microphone or a speaker, as the library reports it. */
export type AudioDevice = {
    /** The platform's own identifier for the device. */
    readonly id: string;
    /** Human-readable name. Empty until microphone permission is granted. */
    readonly label: string;
    readonly kind: "input" | "output";
};
