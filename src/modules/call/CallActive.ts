import type { CallPeer } from "@/modules/call/Peer";
import type { CallStats, ServerCallStats } from "@/modules/call/Stats";
import type { Call, CallDirection, CallStatus, CallType } from "@/modules/device/Call";
import type { CallFailReason } from "@/modules/device/CallFailReason";
import type { ConnectivityIssue, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import type { ITransport, TransportStatus } from "@/modules/media/ITransport";
import type { MediaManager } from "@/modules/media/MediaManager";
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

export function CallActiveProxy(
    call: Call,
    transport: ITransport,
    mediaManager: MediaManager,
    callbacks: {
        onEnd: (call: Call) => void;
    },
): CallActive {
    const emitter = new EventEmitter<CallActiveEvents>();

    let lastIceDiagnostics: IceDiagnostics | undefined;
    const bufferedConnectivityIssues: ConnectivityIssue[] = [];

    let disposed = false;
    const dispose = (): Promise<void> => {
        if (disposed) return Promise.resolve();
        disposed = true;
        return Promise.resolve(transport.stop()).catch(() => {});
    };

    // Pure 1:1 relays — kept type-checked via the typed mapping.
    forwardEvents(call, emitter, {
        stats: "stats",
        serverStats: "serverStats",
        connectionStatus: "connectionStatus",
        status: "status",
    });

    // Side-effecting subscribers (dispose, rename, buffered replay) stay inline.
    call.on("failed", (err) => {
        emitter.emit("error", err);
        void dispose();
    });
    call.on("peerMuted", (muted) => {
        if (muted) emitter.emit("peerMute");
        else emitter.emit("peerUnmute");
    });
    call.on("ended", () => {
        emitter.emit("ended");
        void dispose();
    });
    call.on("iceDiagnostics", (diag) => {
        lastIceDiagnostics = diag;
        emitter.emit("iceDiagnostics", diag);
    });
    call.on("connectivityIssue", (issue) => {
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
        id: call.id,
        type: call.type,
        deviceToken: call.deviceToken,
        direction: call.direction,
        audioAnalyserIn: transport.audioAnalyserIn,
        audioAnalyserOut: transport.audioAnalyserOut,

        mute(): Promise<{ err: string | null }> {
            mediaManager.setMuted(true);
            return Promise.resolve({ err: null });
        },

        unmute(): Promise<{ err: string | null }> {
            mediaManager.setMuted(false);
            return Promise.resolve({ err: null });
        },

        async end(): Promise<{ err: string | null }> {
            if (disposed) return { err: null };
            callbacks.onEnd(call);
            await dispose();
            return { err: null };
        },

        getStats(): Promise<CallStats> {
            return call.getStats();
        },

        on<T extends keyof CallActiveEvents>(event: T, callback: (...args: CallActiveEvents[T]) => void): Unsubscribe {
            if (event === "stats") {
                warnDeprecated("CallActive.stats event", 'use `active.getStats()` instead.');
            }
            if (event === "serverStats") {
                warnDeprecated("CallActive.serverStats event", 'use `active.getStats()` instead.');
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

        /** @deprecated Use `on("error", callback)` instead. */
        onError(callback: (err: CallFailReason) => void): void {
            warnDeprecated("CallActive.onError", 'use `active.on("error", cb)` instead.');
            onErrorUnsub?.();
            onErrorUnsub = emitter.on("error", callback);
        },

        /** @deprecated Use `on("peerMute", callback)` instead. */
        onPeerMute(callback: () => void): void {
            warnDeprecated("CallActive.onPeerMute", 'use `active.on("peerMute", cb)` instead.');
            onPeerMuteUnsub?.();
            onPeerMuteUnsub = emitter.on("peerMute", callback);
        },

        /** @deprecated Use `on("peerUnmute", callback)` instead. */
        onPeerUnmute(callback: () => void): void {
            warnDeprecated("CallActive.onPeerUnmute", 'use `active.on("peerUnmute", cb)` instead.');
            onPeerUnmuteUnsub?.();
            onPeerUnmuteUnsub = emitter.on("peerUnmute", callback);
        },

        /** @deprecated Use `on("ended", callback)` instead. */
        onEnd(callback: () => void): void {
            warnDeprecated("CallActive.onEnd", 'use `active.on("ended", cb)` instead.');
            onEndUnsub?.();
            onEndUnsub = emitter.on("ended", callback);
        },

        /** @deprecated Use `on("stats", callback)` instead. */
        onStats(callback: (stats: CallStats) => void): void {
            warnDeprecated("CallActive.onStats", 'use `active.on("stats", cb)` instead.');
            onStatsUnsub?.();
            onStatsUnsub = emitter.on("stats", callback);
        },

        /** @deprecated Use `on("connectionStatus", callback)` instead. */
        onConnectionStatus(callback: (status: TransportStatus) => void): void {
            warnDeprecated("CallActive.onConnectionStatus", 'use `active.on("connectionStatus", cb)` instead.');
            onConnectionStatusUnsub?.();
            onConnectionStatusUnsub = emitter.on("connectionStatus", callback);
        },

        /** @deprecated Use `on("status", callback)` instead. */
        onStatus(cb: (status: CallStatus) => void): void {
            warnDeprecated("CallActive.onStatus", 'use `active.on("status", cb)` instead.');
            onStatusUnsub?.();
            onStatusUnsub = emitter.on("status", cb);
        },
    } as CallActive;

    // Live getters — Call.status, transport.status and transport.peerMuted change over the
    // lifetime of the proxy. Snapshotting would freeze them at construction time.
    Object.defineProperties(proxy, {
        status: { get: () => call.status, enumerable: true },
        connectionStatus: { get: () => transport.status, enumerable: true },
        peer: { get: () => ({ ...call.peer, muted: transport.peerMuted }), enumerable: true },
        // Deprecated snake-case aliases — warn-once on access.
        device_token: {
            get: () => {
                warnDeprecated("CallActive.device_token", "use `active.deviceToken` instead.");
                return call.deviceToken;
            },
            enumerable: true,
        },
        connection_status: {
            get: () => {
                warnDeprecated("CallActive.connection_status", "use `active.connectionStatus` instead.");
                return transport.status;
            },
            enumerable: true,
        },
        audio_analyser: {
            get: () => {
                warnDeprecated("CallActive.audio_analyser", "use `active.audioAnalyserIn` instead.");
                return transport.audioAnalyserIn;
            },
            enumerable: true,
        },
    });

    return proxy;
}
