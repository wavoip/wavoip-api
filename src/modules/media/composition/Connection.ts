import type { ConnectivityIssue, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import type { TransportKind, TransportStatus } from "@/modules/media/ITransport";
import type { EventEmitter } from "@/modules/shared/EventEmitter";

/**
 * O `IConnection` base não é genérico no mapa de eventos: o mapa de listeners do
 * EventEmitter é invariante no parâmetro de tipo, e uma base genérica impediria a
 * atribuição dos subtipos. Cada subtipo declara a própria linhagem de `EventEmitter<...>`.
 */

export type ConnectionEvents = {
    statusChanged: [status: TransportStatus];
};

export interface IConnection {
    readonly kind: TransportKind;
    status: TransportStatus;
    start(): Promise<void>;
    stop(): Promise<void>;
}

export type RTCConnectionEvents = ConnectionEvents & {
    iceDiagnostics: [diag: IceDiagnostics];
    connectivityIssue: [issue: ConnectivityIssue];
};

export interface IRTCConnection extends IConnection, EventEmitter<RTCConnectionEvents> {
    readonly kind: "webrtc";
    readonly pc: RTCPeerConnection;
    readonly answer: Promise<RTCSessionDescriptionInit>;
    lastDiagnostics: IceDiagnostics | null;
    emittedConnectivityIssues: ReadonlySet<ConnectivityIssue>;
    createOffer(): Promise<string>;
    setAnswer(sdp: string): Promise<void>;
}

export type WSConnectionEvents = ConnectionEvents & {
    message: [data: ArrayBuffer];
};

export type RelayAddress = { host: string; port: string };

export interface IWSConnection extends IConnection, EventEmitter<WSConnectionEvents> {
    readonly kind: "ws";
    useRelay(server: RelayAddress): void;
    send(data: ArrayBuffer): void;
}

export function isRTCConnection(c: IConnection): c is IRTCConnection {
    return c.kind === "webrtc";
}

export function isWSConnection(c: IConnection): c is IWSConnection {
    return c.kind === "ws";
}
