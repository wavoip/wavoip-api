import type { CallPeer } from "@/modules/call/Peer";
import type { CallSession, CallSessionEvents } from "@/application/call/CallSession";
import type { CallStats, ServerCallStats } from "@/domain/call/stats";
import type { CallDirection, CallStatus, CallType, TransportStatus } from "@/domain/call/types";
import type { CallFailReason } from "@/domain/call/failReason";
import type { ConnectivityIssue, IceDiagnostics } from "@/domain/call/ice";
import { warnDeprecated } from "@/modules/shared/deprecation";
import { EventEmitter, type Unsubscribe } from "@/modules/shared/EventEmitter";
import { forwardEvents } from "@/modules/shared/forwardEvents";

export type CallActiveEvents = {
    error: [err: CallFailReason];
    peerMute: [];
    peerUnmute: [];
    ended: [];
    stats: [stats: CallStats];
    serverStats: [stats: ServerCallStats];
    connectionStatus: [status: TransportStatus];
    status: [status: CallStatus];
    iceDiagnostics: [diag: IceDiagnostics];
    connectivityIssue: [issue: ConnectivityIssue];
};

export interface CallActive {
    id: string;
    type: CallType;
    direction: CallDirection;
    peer: CallPeer;
    deviceToken: string;
    status: CallStatus;
    connectionStatus: TransportStatus;
    /** Inbound (peer → local speaker) AnalyserNode. */
    audioAnalyserIn: Promise<AnalyserNode>;
    /** Outbound (local mic → peer) AnalyserNode. */
    audioAnalyserOut: Promise<AnalyserNode>;
    /** @deprecated Use `deviceToken` instead. */
    device_token: string;
    /** @deprecated Use `connectionStatus` instead. */
    connection_status: TransportStatus;
    /** @deprecated Use `audioAnalyserIn` instead. */
    audio_analyser: Promise<AnalyserNode>;
    mute(): Promise<{ err: string | null }>;
    unmute(): Promise<{ err: string | null }>;
    end(): Promise<{ err: string | null }>;
    /**
     * Pull the most recent CallStats snapshot. The `stats` event is deprecated
     * and pinned to the library's internal cadence; this method lets the
     * consumer drive cadence (e.g. paint waveform per RAF, or refresh a
     * dashboard once per second).
     */
    getStats(): Promise<CallStats>;
    on<T extends keyof CallActiveEvents>(event: T, callback: (...args: CallActiveEvents[T]) => void): Unsubscribe;
    /** @deprecated Use `on("error", callback)` instead. */
    onError(callback: (err: CallFailReason) => void): void;
    /** @deprecated Use `on("peerMute", callback)` instead. */
    onPeerMute(callback: () => void): void;
    /** @deprecated Use `on("peerUnmute", callback)` instead. */
    onPeerUnmute(callback: () => void): void;
    /** @deprecated Use `on("ended", callback)` instead. */
    onEnd(callback: () => void): void;
    /** @deprecated Use `on("stats", callback)` instead. */
    onStats(callback: (stats: CallStats) => void): void;
    /** @deprecated Use `on("connectionStatus", callback)` instead. */
    onConnectionStatus(callback: (status: TransportStatus) => void): void;
    /** @deprecated Use `on("status", callback)` instead. */
    onStatus(cb: (status: CallStatus) => void): void;
}

export function CallActiveProxy(session: CallSession): CallActive {
    const emitter = new EventEmitter<CallActiveEvents>();

    let lastIceDiagnostics: IceDiagnostics | undefined;
    const bufferedConnectivityIssues: ConnectivityIssue[] = [];

    forwardEvents<CallSessionEvents, CallActiveEvents>(session, emitter, {
        stats: "stats",
        serverStats: "serverStats",
        connectionStatus: "connectionStatus",
        status: "status",
    });

    session.on("failed", (err) => emitter.emit("error", err));
    session.on("peerMuted", (muted) => emitter.emit(muted ? "peerMute" : "peerUnmute"));
    session.on("ended", () => emitter.emit("ended"));
    session.on("iceDiagnostics", (diag) => {
        lastIceDiagnostics = diag;
        emitter.emit("iceDiagnostics", diag);
    });
    session.on("connectivityIssue", (issue) => {
        bufferedConnectivityIssues.push(issue);
        emitter.emit("connectivityIssue", issue);
    });

    let onErrorUnsub: Unsubscribe | undefined;
    let onPeerMuteUnsub: Unsubscribe | undefined;
    let onPeerUnmuteUnsub: Unsubscribe | undefined;
    let onEndUnsub: Unsubscribe | undefined;
    let onStatsUnsub: Unsubscribe | undefined;
    let onConnectionStatusUnsub: Unsubscribe | undefined;
    let onStatusUnsub: Unsubscribe | undefined;

    const proxy = {
        id: session.id,
        type: session.type,
        deviceToken: session.deviceToken,
        direction: session.direction,
        audioAnalyserIn: session.media?.audioAnalyserIn as Promise<AnalyserNode>,
        audioAnalyserOut: session.media?.audioAnalyserOut as Promise<AnalyserNode>,

        async mute(): Promise<{ err: string | null }> {
            return { err: await session.mute(true, "active") };
        },

        async unmute(): Promise<{ err: string | null }> {
            return { err: await session.mute(false, "active") };
        },

        async end(): Promise<{ err: string | null }> {
            await session.end();
            return { err: null };
        },

        getStats(): Promise<CallStats> {
            return session.getStats();
        },

        on<T extends keyof CallActiveEvents>(event: T, callback: (...args: CallActiveEvents[T]) => void): Unsubscribe {
            if (event === "stats") {
                warnDeprecated("CallActive.stats event", "use `active.getStats()` instead.");
            }
            if (event === "serverStats") {
                warnDeprecated("CallActive.serverStats event", "use `active.getStats()` instead.");
            }
            const unsub = emitter.on(event, callback);
            if (event === "iceDiagnostics" && lastIceDiagnostics) {
                (callback as (diag: IceDiagnostics) => void)(lastIceDiagnostics);
            }
            if (event === "connectivityIssue" && bufferedConnectivityIssues.length) {
                for (const issue of bufferedConnectivityIssues) {
                    (callback as (issue: ConnectivityIssue) => void)(issue);
                }
            }
            return unsub;
        },

        onError(callback: (err: CallFailReason) => void): void {
            warnDeprecated("CallActive.onError", 'use `active.on("error", cb)` instead.');
            onErrorUnsub?.();
            onErrorUnsub = emitter.on("error", callback);
        },

        onPeerMute(callback: () => void): void {
            warnDeprecated("CallActive.onPeerMute", 'use `active.on("peerMute", cb)` instead.');
            onPeerMuteUnsub?.();
            onPeerMuteUnsub = emitter.on("peerMute", callback);
        },

        onPeerUnmute(callback: () => void): void {
            warnDeprecated("CallActive.onPeerUnmute", 'use `active.on("peerUnmute", cb)` instead.');
            onPeerUnmuteUnsub?.();
            onPeerUnmuteUnsub = emitter.on("peerUnmute", callback);
        },

        onEnd(callback: () => void): void {
            warnDeprecated("CallActive.onEnd", 'use `active.on("ended", cb)` instead.');
            onEndUnsub?.();
            onEndUnsub = emitter.on("ended", callback);
        },

        onStats(callback: (stats: CallStats) => void): void {
            warnDeprecated("CallActive.onStats", 'use `active.on("stats", cb)` instead.');
            onStatsUnsub?.();
            onStatsUnsub = emitter.on("stats", callback);
        },

        onConnectionStatus(callback: (status: TransportStatus) => void): void {
            warnDeprecated("CallActive.onConnectionStatus", 'use `active.on("connectionStatus", cb)` instead.');
            onConnectionStatusUnsub?.();
            onConnectionStatusUnsub = emitter.on("connectionStatus", callback);
        },

        onStatus(cb: (status: CallStatus) => void): void {
            warnDeprecated("CallActive.onStatus", 'use `active.on("status", cb)` instead.');
            onStatusUnsub?.();
            onStatusUnsub = emitter.on("status", cb);
        },
    } as CallActive;

    // Getters vivos: o status da chamada, o do transporte e o mute do outro lado mudam ao
    // longo da vida do proxy, e uma cópia os congelaria no valor da construção.
    Object.defineProperties(proxy, {
        status: { get: () => session.status, enumerable: true },
        connectionStatus: { get: () => session.connectionStatus, enumerable: true },
        peer: { get: () => ({ ...session.peer, muted: session.peerMuted }), enumerable: true },
        device_token: {
            get: () => {
                warnDeprecated("CallActive.device_token", "use `active.deviceToken` instead.");
                return session.deviceToken;
            },
            enumerable: true,
        },
        connection_status: {
            get: () => {
                warnDeprecated("CallActive.connection_status", "use `active.connectionStatus` instead.");
                return session.connectionStatus;
            },
            enumerable: true,
        },
        audio_analyser: {
            get: () => {
                warnDeprecated("CallActive.audio_analyser", "use `active.audioAnalyserIn` instead.");
                return session.media?.audioAnalyserIn;
            },
            enumerable: true,
        },
    });

    return proxy;
}
