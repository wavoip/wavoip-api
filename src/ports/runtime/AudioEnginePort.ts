import type { MediaStreamLike } from "@/ports/runtime/PeerConnectionPort";

/**
 * O medidor de nível que a plataforma usa — na web, um `AnalyserNode`. O núcleo não lê
 * nada dele: ele só é repassado a quem consome a biblioteca, em
 * `ActiveCall.audioAnalyserIn`/`Out`. Quem sabe o que é são o adaptador que o cria e o
 * integrador que o recebe, e por isso o tipo dele não mora aqui.
 */
export type AudioMeter = unknown;

/** Tudo que o motor abre se fecha pelo próprio handle. */
export interface AudioHandle {
    readonly meter: AudioMeter;
    stop(): void;
}

/** A reprodução do PCM que chega pelo relay. */
export interface PcmPlayback extends AudioHandle {
    write(pcm: ArrayBuffer): void;
}

/**
 * O motor de áudio da plataforma: na web é o `AudioContext` com os worklets, no React
 * Native é o módulo nativo. Quem chama não sabe qual é — nem o `RTCAudioPipe` nem o
 * `WSAudioPipe` tocam em `AudioContext`, `AudioWorkletNode` ou `Audio` direto.
 *
 * O PCM que entra e sai daqui é Int16 a 16kHz, que é o formato do relay (ver
 * `AudioWorkletOut`).
 */
export interface AudioEnginePort {
    /** Segundos entre o motor e o alto-falante; vira `output_latency_ms` nas stats. */
    readonly outputLatency: number;
    /** Deixa pronto o que precisa carregar antes de tocar; na web, os worklets. */
    prepare(): Promise<void>;
    resume(): Promise<void>;
    suspend(): Promise<void>;
    close(): Promise<void>;
    /** Toca no alto-falante o stream que o WebRTC recebe do outro lado. */
    playStream(stream: MediaStreamLike): AudioHandle;
    /** Mede o microfone sem devolvê-lo no alto-falante. */
    monitorStream(stream: MediaStreamLike): AudioHandle;
    /** Liga o microfone ao reamostrador e entrega cada frame de PCM pronto para o relay. */
    capturePcm(stream: MediaStreamLike, onFrame: (pcm: ArrayBuffer) => void): AudioHandle;
    playPcm(): PcmPlayback;
}
