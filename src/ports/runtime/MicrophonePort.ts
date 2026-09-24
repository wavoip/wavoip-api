import type { MediaStreamLike } from "@/ports/runtime/PeerConnectionPort";

/**
 * O microfone que as chamadas compartilham. Na web é o `getUserMedia`; no React Native, o
 * módulo nativo equivalente.
 *
 * O stream é um só para todas as chamadas — por isso `open()` chamado duas vezes devolve o
 * mesmo. Cada chamada ganhar a própria track é a DEV-526 PR H.
 */
export interface MicrophonePort {
    open(): Promise<MediaStreamLike>;
    close(): Promise<void>;
    readonly muted: boolean;
    /** O mute vale para todas as chamadas enquanto o stream for um só. */
    setMuted(muted: boolean): void;
}
