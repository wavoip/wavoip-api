import type { CallSession, CallSessionEvents } from "@/application/call/CallSession";
import type { CallFailReason } from "@/domain/call/failReason";
import type { ConnectivityIssue, IceDiagnostics } from "@/domain/call/ice";
import type { CallStats } from "@/domain/call/stats";
import type { CallDirection, CallStatus, CallType, TransportStatus } from "@/domain/call/types";
import { toLegacy } from "@/modules/call/legacyResult";
import type { CallPeer } from "@/modules/call/Peer";
import { EventEmitter, type Unsubscribe } from "@/modules/shared/EventEmitter";
import { forwardEvents } from "@/modules/shared/forwardEvents";

export type CallActiveEvents = {
    error: [err: CallFailReason];
    peerMute: [];
    peerUnmute: [];
    ended: [];
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
    mute(): Promise<{ err: string | null }>;
    unmute(): Promise<{ err: string | null }>;
    end(): Promise<{ err: string | null }>;
    /**
     * Pull the most recent CallStats snapshot. The consumer drives the cadence:
     * paint a waveform per animation frame, or refresh a dashboard once a second.
     */
    getStats(): Promise<CallStats>;
    on<T extends keyof CallActiveEvents>(event: T, callback: (...args: CallActiveEvents[T]) => void): Unsubscribe;
}

export function CallActiveProxy(session: CallSession): CallActive {
    const emitter = new EventEmitter<CallActiveEvents>();

    let lastIceDiagnostics: IceDiagnostics | undefined;
    const bufferedConnectivityIssues: ConnectivityIssue[] = [];

    forwardEvents<CallSessionEvents, CallActiveEvents>(session, emitter, {
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

    const proxy = {
        id: session.id,
        type: session.type,
        deviceToken: session.deviceToken,
        direction: session.direction,
        audioAnalyserIn: session.media?.meterIn as Promise<AnalyserNode>,
        audioAnalyserOut: session.media?.meterOut as Promise<AnalyserNode>,

        async mute(): Promise<{ err: string | null }> {
            return toLegacy(await session.mute(true));
        },

        async unmute(): Promise<{ err: string | null }> {
            return toLegacy(await session.mute(false));
        },

        async end(): Promise<{ err: string | null }> {
            return toLegacy(await session.end());
        },

        getStats(): Promise<CallStats> {
            return session.getStats();
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
    } as CallActive;

    // Getters vivos: o status da chamada, o do transporte e o mute do outro lado mudam ao
    // longo da vida do proxy, e uma cópia os congelaria no valor da construção.
    Object.defineProperties(proxy, {
        status: { get: () => session.status, enumerable: true },
        connectionStatus: { get: () => session.connectionStatus, enumerable: true },
        peer: { get: () => ({ ...session.peer, muted: session.peerMuted }), enumerable: true },
    });

    return proxy;
}
