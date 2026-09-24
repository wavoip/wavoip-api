import type { CallAudio } from "@/domain/call/audio";
import type { CallStats } from "@/domain/call/stats";
import type { MediaPlan } from "@/domain/call/types";
import type { TransportStatus } from "@/domain/call/types";
import type { ConnectivityIssue, IceConfig, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import type { EventEmitter } from "@/modules/shared/EventEmitter";
import type { WavoipRuntime } from "@/ports/WavoipRuntime";

export type { TransportStatus } from "@/domain/call/types";
export type TransportKind = "webrtc" | "ws";

/**
 * O que o transporte usa da plataforma. É um recorte do `WavoipRuntime`: o transporte não
 * enxerga a lista de aparelhos, que é assunto da API pública.
 */
export type MediaRuntime = Pick<WavoipRuntime, "engine" | "microphone" | "createPeer" | "openSocket">;

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
    /** O que mede o áudio das duas direções; é o `call.audio` da API pública. */
    readonly audio: CallAudio;
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

/** O que só o lado cliente do relay mede (ver `relay/StatsAdapter`). */
export interface RelayMeasurements {
    readTxLevel(): number;
    readRxLevel(): number;
    /** O áudio que chegou e ainda não tocou; `null` antes da primeira medida. */
    readBufferedMs(): number | null;
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
