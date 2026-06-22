import type { CallStats } from "@/modules/call/Stats";
import type { ConnectivityIssue, IceConfig, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import type { EventEmitter } from "@/modules/shared/EventEmitter";

export type TransportStatus = "disconnected" | "connected" | "connecting" | "reconnecting";
export type TransportKind = "webrtc" | "ws";

export const DEFAULT_STATS_TICK_MS = 200;

/**
 * Transport-wide options bag. Bundles every per-call knob the host app might
 * want to tune so transport constructors stay terse (`mediaManager, offer?, options?`)
 * instead of growing a positional zoo. Both fields are optional — defaults
 * cover the common case.
 *
 * - `iceConfig` — STUN/TURN servers and ICE gathering timeout. WebRTC only;
 *   ignored by the WS transport.
 * - `statsTickMs` — cadence of the (deprecated) `stats` / `serverStats`
 *   event ticker. Has no effect on `Call.getStats()`, which is pull-based and
 *   runs at the caller's chosen cadence.
 */
export type TransportOptions = {
    iceConfig?: IceConfig;
    statsTickMs?: number;
};

export type Events = {
    statusChanged: [status: TransportStatus];
    statsChanged: [stats: CallStats];
    peerMuted: [muted: boolean];
    iceDiagnostics: [diag: IceDiagnostics];
    connectivityIssue: [issue: ConnectivityIssue];
};

export interface ITransport extends EventEmitter<Events> {
    readonly kind: TransportKind;
    status: TransportStatus;
    peerMuted: boolean;
    audioAnalyser: Promise<AnalyserNode>;
    stats: CallStats;

    start(): Promise<void>;
    stop(): Promise<void>;

    /**
     * Pull-based stats accessor — triggers an adapter `refresh()` and returns
     * the resulting snapshot. The internal `statsChanged` event still fires at
     * a fixed 200ms cadence (deprecated; consumers should call `Call.getStats()`
     * at their preferred cadence instead).
     */
    getStats(): Promise<CallStats>;
}

/**
 * WebRTC-specific surface. Adds SDP-handshake methods and replay state for ICE
 * diagnostics so Call.wireTransport can catch late listeners up.
 *
 * Use `isRTCTransport` to narrow an `ITransport` to this richer type.
 */
export interface IRTCTransport extends ITransport {
    readonly kind: "webrtc";
    readonly answer: Promise<RTCSessionDescriptionInit>;
    lastDiagnostics: IceDiagnostics | null;
    emittedConnectivityIssues: ReadonlySet<ConnectivityIssue>;
    createOffer(): Promise<string>;
    setAnswer(sdp: string): Promise<void>;
}

export function isRTCTransport(t: ITransport): t is IRTCTransport {
    return t.kind === "webrtc";
}
