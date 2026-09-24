import type { MediaStreamLike } from "@/ports/runtime/PeerConnectionPort";

/**
 * The microphone the calls share. On the web it is `getUserMedia`; on React Native, the
 * equivalent native module.
 *
 * There is a single stream for every call, which is why calling `open()` twice hands back
 * the same one.
 */
export interface MicrophonePort {
    open(): Promise<MediaStreamLike>;
    close(): Promise<void>;
    readonly muted: boolean;
    /** Muting applies to every call, as long as the stream is shared. */
    setMuted(muted: boolean): void;
}
