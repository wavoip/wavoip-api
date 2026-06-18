import type { CallPeer } from "@/modules/call/Peer";
import type { CallStats, ServerCallStats } from "@/modules/call/Stats";
import type { Call, CallDirection, CallStatus, CallType } from "@/modules/device/Call";
import type { ConnectivityIssue, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import type { ITransport, TransportStatus } from "@/modules/media/ITransport";
import type { MediaManager } from "@/modules/media/MediaManager";
import { EventEmitter, type Unsubscribe } from "@/modules/shared/EventEmitter";

export type CallActiveEvents = {
    error: [err: string];
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
    device_token: string;
    status: CallStatus;
    connection_status: TransportStatus;
    audio_analyser: Promise<AnalyserNode>;
    mute(): Promise<{ err: string | null }>;
    unmute(): Promise<{ err: string | null }>;
    end(): Promise<{ err: string | null }>;
    on<T extends keyof CallActiveEvents>(event: T, callback: (...args: CallActiveEvents[T]) => void): Unsubscribe;
    /** @deprecated Use `on("error", callback)` instead. */
    onError(callback: (err: string) => void): void;
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
    call.on("stats", (stats) => {
        emitter.emit("stats", stats);
    });
    call.on("serverStats", (stats) => {
        emitter.emit("serverStats", stats);
    });
    call.on("connectionStatus", (status) => {
        emitter.emit("connectionStatus", status);
    });
    call.on("status", (status) => {
        emitter.emit("status", status);
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
        device_token: call.deviceToken,
        direction: call.direction,
        audio_analyser: transport.audioAnalyser,

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

        on<T extends keyof CallActiveEvents>(event: T, callback: (...args: CallActiveEvents[T]) => void): Unsubscribe {
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
        onError(callback: (err: string) => void): void {
            onErrorUnsub?.();
            onErrorUnsub = emitter.on("error", callback);
        },

        /** @deprecated Use `on("peerMute", callback)` instead. */
        onPeerMute(callback: () => void): void {
            onPeerMuteUnsub?.();
            onPeerMuteUnsub = emitter.on("peerMute", callback);
        },

        /** @deprecated Use `on("peerUnmute", callback)` instead. */
        onPeerUnmute(callback: () => void): void {
            onPeerUnmuteUnsub?.();
            onPeerUnmuteUnsub = emitter.on("peerUnmute", callback);
        },

        /** @deprecated Use `on("ended", callback)` instead. */
        onEnd(callback: () => void): void {
            onEndUnsub?.();
            onEndUnsub = emitter.on("ended", callback);
        },

        /** @deprecated Use `on("stats", callback)` instead. */
        onStats(callback: (stats: CallStats) => void): void {
            onStatsUnsub?.();
            onStatsUnsub = emitter.on("stats", callback);
        },

        /** @deprecated Use `on("connectionStatus", callback)` instead. */
        onConnectionStatus(callback: (status: TransportStatus) => void): void {
            onConnectionStatusUnsub?.();
            onConnectionStatusUnsub = emitter.on("connectionStatus", callback);
        },

        /** @deprecated Use `on("status", callback)` instead. */
        onStatus(cb: (status: CallStatus) => void): void {
            onStatusUnsub?.();
            onStatusUnsub = emitter.on("status", cb);
        },
    } as CallActive;

    // Live getters — Call.status, transport.status and transport.peerMuted change over the
    // lifetime of the proxy. Snapshotting would freeze them at construction time.
    Object.defineProperties(proxy, {
        status: { get: () => call.status, enumerable: true },
        connection_status: { get: () => transport.status, enumerable: true },
        peer: { get: () => ({ ...call.peer, muted: transport.peerMuted }), enumerable: true },
    });

    return proxy;
}
