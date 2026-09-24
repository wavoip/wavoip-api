import type { MediaStreamLike } from "@/ports/runtime/PeerConnectionPort";

/** Tudo que o motor abre se fecha pelo próprio handle. */
export interface AudioHandle {
    stop(): void;
}

/** Um handle que também mede o nível do que passa por ele, de 0 a 1. */
export interface AudioMeter extends AudioHandle {
    level(): number;
}

/** A reprodução do PCM que chega pelo relay. */
export interface PcmPlayback extends AudioHandle {
    write(pcm: ArrayBuffer): void;
    /**
     * Quanto áudio já chegou e ainda não tocou, em milissegundos. `null` até a primeira
     * medida, ou onde a plataforma não mede.
     */
    bufferedMs(): number | null;
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
    /**
     * Segundos entre o motor de áudio e o alto-falante, ou `null` onde a plataforma não
     * informa (o Safari não implementa `outputLatency`). Vira `latency.playout_ms`.
     *
     * Não inclui o que espera na fila de reprodução: isso é o `bufferedMs` do `PcmPlayback`.
     */
    readonly outputLatency: number | null;
    /** Deixa pronto o que precisa carregar antes de tocar; na web, os worklets. */
    prepare(): Promise<void>;
    resume(): Promise<void>;
    suspend(): Promise<void>;
    close(): Promise<void>;
    /** Toca no alto-falante o stream que o WebRTC recebe do outro lado, medindo o nível. */
    playStream(stream: MediaStreamLike): AudioMeter;
    /** Mede o microfone sem devolvê-lo no alto-falante. */
    monitorStream(stream: MediaStreamLike): AudioMeter;
    /**
     * Liga o microfone ao reamostrador e entrega cada frame de PCM pronto para o relay.
     * Não mede: o nível do relay sai do próprio PCM (ver `rmsInt16`).
     */
    capturePcm(stream: MediaStreamLike, onFrame: (pcm: ArrayBuffer) => void): AudioHandle;
    playPcm(): PcmPlayback;
}
