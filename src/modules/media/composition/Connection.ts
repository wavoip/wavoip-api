import type { ConnectivityIssue, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import type { TransportKind, TransportStatus } from "@/modules/media/ITransport";
import type { EventEmitter } from "@/modules/shared/EventEmitter";

/**
 * Connection role — owns the network lifecycle: open / close / reconnect for a
 * single peer-link. No mic or speaker wiring (that's `IAudioPipe`) and no stats
 * absorption (`IStatsAdapter`). Connection state surfaces purely as a typed
 * `status` event; consumers compose three roles to assemble a transport.
 *
 * Two concrete kinds extend the base shape via the `kind` discriminator:
 * - `IRTCConnection` — RTCPeerConnection + SDP handshake + ICE diagnostics
 * - `IWSConnection`  — WebSocket binary pump + reconnect
 *
 * The base `IConnection` is not generic over its event map: EventEmitter's
 * listener map is invariant in its event-type parameter, so a generic base
 * would block sub-interface assignment. Each subtype declares its own
 * `EventEmitter<...>` lineage directly.
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

export interface IWSConnection extends IConnection, EventEmitter<WSConnectionEvents> {
    readonly kind: "ws";
    send(data: ArrayBuffer): void;
}

export function isRTCConnection(c: IConnection): c is IRTCConnection {
    return c.kind === "webrtc";
}

export function isWSConnection(c: IConnection): c is IWSConnection {
    return c.kind === "ws";
}
