import type { CallStats } from "@/domain/call/stats";
import type { MediaPlan } from "@/domain/call/types";
import type { TransportStatus } from "@/domain/call/types";
import type { ConnectivityIssue, IceConfig, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import type { EventEmitter } from "@/modules/shared/EventEmitter";
import type { AudioEnginePort, AudioMeter } from "@/ports/runtime/AudioEnginePort";
import type { MicrophonePort } from "@/ports/runtime/MicrophonePort";

export type { TransportStatus } from "@/domain/call/types";
export type TransportKind = "webrtc" | "ws";

/** O áudio da plataforma como o transporte o usa. */
export type AudioRuntime = {
    readonly engine: AudioEnginePort;
    readonly microphone: MicrophonePort;
};

/** Só o WebRTC tem opção; o relay não recebe nenhuma. */
export type TransportOptions = {
    iceConfig?: IceConfig;
};

export type Events = {
    statusChanged: [status: TransportStatus];
    peerMuted: [muted: boolean];
    iceDiagnostics: [diag: IceDiagnostics];
    connectivityIssue: [issue: ConnectivityIssue];
};

export interface ITransport extends EventEmitter<Events> {
    readonly kind: TransportKind;
    status: TransportStatus;
    peerMuted: boolean;
    /** O que mede o que chega e o que sai; vira `audioAnalyserIn`/`Out` na API pública. */
    meterIn: Promise<AudioMeter>;
    meterOut: Promise<AudioMeter>;
    stats: CallStats;

    /**
     * Sobe a mídia para atender a oferta e devolve o plano local que vai no `call.accept`.
     * O WebRTC devolve o SDP da resposta; o relay não tem o que mandar e conecta sozinho.
     */
    accept(): Promise<MediaPlan>;
    /** Completa a mídia com o plano que o outro lado mandou ao atender. */
    connect(plan: MediaPlan): Promise<void>;
    stop(): Promise<void>;

    getStats(): Promise<CallStats>;
}

export interface IRTCTransport extends ITransport {
    readonly kind: "webrtc";
    lastDiagnostics: IceDiagnostics | null;
    emittedConnectivityIssues: ReadonlySet<ConnectivityIssue>;
    /** O SDP da oferta que a chamada que sai manda no `call.start`. */
    createOffer(): Promise<string>;
}

/** O endereço que o relay informa quando a chamada é aceita. */
export type RelayAddress = { host: string; port: string };

/** Lê o nível do áudio que passa, para as stats do relay (ver `relay/StatsAdapter`). */
export interface AudioLevelProvider {
    readTxLevel(): number;
    readRxLevel(): number;
}

/**
 * Dois métodos para separar a leitura barata do cache (`snapshot`, síncrona) da absorção
 * que pode ser assíncrona (`refresh`, que no WebRTC é o `pc.getStats()`).
 */
export interface IStatsAdapter {
    snapshot(): CallStats;
    refresh(): Promise<void>;
}

export interface IWSTransport extends ITransport {
    readonly kind: "ws";
    /** Onde o relay atende, conhecido só quando a chamada é aceita. */
    useRelay(server: { host: string; port: string }): void;
}

export function isRTCTransport(t: ITransport): t is IRTCTransport {
    return t.kind === "webrtc";
}

export function isWSTransport(t: ITransport): t is IWSTransport {
    return t.kind === "ws";
}
