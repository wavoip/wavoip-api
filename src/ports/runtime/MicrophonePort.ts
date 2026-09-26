import type { MediaStreamLike } from "@/ports/runtime/PeerConnectionPort";

/**
 * The microphone the calls share. On the web it is `getUserMedia`; on React Native, the
 * equivalent native module.
 *
 * There is a single stream for every call, which is why calling `open()` twice hands back
 * the same one.
 */
export interface MicrophonePort {
    /**
     * Whether the shared stream is already open.
     *
     * Whoever opens the microphone for a moment — the diagnostics do — has to know this
     * before closing it: the stream belongs to every call at once, and closing one that a
     * call is using cuts that call's audio.
     */
    readonly isOpen: boolean;
    open(): Promise<MediaStreamLike>;
    close(): Promise<void>;
    readonly muted: boolean;
    /** Muting applies to every call, as long as the stream is shared. */
    setMuted(muted: boolean): void;
}
