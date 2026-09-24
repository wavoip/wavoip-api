import type { CallSession, CallSessionEvents } from "@/application/call/CallSession";
import type { CallFailureCode, CommandFailure, WavoipError } from "@/domain/shared/errors";
import type { Result } from "@/domain/shared/Result";
import type { ConnectivityIssue, IceDiagnostics } from "@/domain/call/ice";
import type { CallStats } from "@/domain/call/stats";
import type { AudioAnalyser, CallAudio } from "@/domain/call/audio";
import { type CallConnection, Connection } from "@/domain/call/connection";
import type { CallDirection, CallStatus, CallType } from "@/domain/call/types";
import type { CallPeer } from "@/modules/call/Peer";
import { EventEmitter, type Unsubscribe } from "@/modules/shared/EventEmitter";
import { forwardEvents } from "@/modules/shared/forwardEvents";

export type ActiveCallEvents = {
    /** The peer hung up. Hanging up from here answers in the `end()` result instead. */
    ended: [];
    /** The call dropped on its own. */
    failed: [error: WavoipError<CallFailureCode | "UNKNOWN">];
    /** The peer muted or unmuted their microphone. */
    peerMuteChanged: [muted: boolean];
    /** Either leg of the call — local media or the WhatsApp side — came or went. */
    connectionChanged: [connection: CallConnection];
    iceDiagnostics: [diag: IceDiagnostics];
    connectivityIssue: [issue: ConnectivityIssue];
};

export interface ActiveCall {
    id: string;
    type: CallType;
    direction: CallDirection;
    peer: CallPeer;
    deviceToken: string;
    /** Always current, even inside an event handler. */
    status: CallStatus;
    /** Both legs of the call in one state: local media and the WhatsApp side. */
    connection: CallConnection;
    /**
     * Reads the audio going each way, right now. Both levels are synchronous, so they can
     * be read from a `requestAnimationFrame` to drive a live meter.
     */
    audio: CallAudio;
    mute(): Promise<Result<void, CommandFailure>>;
    unmute(): Promise<Result<void, CommandFailure>>;
    /** Hangs up. The peer hanging up arrives as the `ended` event instead. */
    end(): Promise<Result<void, CommandFailure>>;
    /**
     * Pull the most recent CallStats snapshot. The consumer drives the cadence:
     * paint a waveform per animation frame, or refresh a dashboard once a second.
     */
    getStats(): Promise<CallStats>;
    on<T extends keyof ActiveCallEvents>(event: T, callback: (...args: ActiveCallEvents[T]) => void): Unsubscribe;
}

/** Uma chamada sem mídia lê zero, e não erro. */
const SILENT: AudioAnalyser = { level: () => 0 };
const SILENT_AUDIO: CallAudio = { in: SILENT, out: SILENT };

export function ActiveCallProxy(session: CallSession): ActiveCall {
    const emitter = new EventEmitter<ActiveCallEvents>();

    let lastIceDiagnostics: IceDiagnostics | undefined;
    const bufferedConnectivityIssues: ConnectivityIssue[] = [];

    forwardEvents<CallSessionEvents, ActiveCallEvents>(session, emitter, {
        failed: "failed",
        peerMuted: "peerMuteChanged",
        ended: "ended",
    });

    // As duas pernas alimentam um estado só, então o evento sai apenas quando o valor
    // junto muda: sem isto, um `call:connected` com o transporte já conectado repetiria.
    let connection = Connection.merge(session.connectionStatus, session.status);
    const announceConnection = () => {
        const merged = Connection.merge(session.connectionStatus, session.status);
        if (merged === connection) return;
        connection = merged;
        emitter.emit("connectionChanged", merged);
    };
    session.on("connectionStatus", announceConnection);
    session.on("status", announceConnection);

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
        audio: session.media?.audio ?? SILENT_AUDIO,

        mute(): Promise<Result<void, CommandFailure>> {
            return session.mute(true);
        },

        unmute(): Promise<Result<void, CommandFailure>> {
            return session.mute(false);
        },

        end(): Promise<Result<void, CommandFailure>> {
            return session.end();
        },

        getStats(): Promise<CallStats> {
            return session.getStats();
        },

        on<T extends keyof ActiveCallEvents>(event: T, callback: (...args: ActiveCallEvents[T]) => void): Unsubscribe {
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
    } as ActiveCall;

    // Getters vivos: o status da chamada, o do transporte e o mute do outro lado mudam ao
    // longo da vida do proxy, e uma cópia os congelaria no valor da construção.
    Object.defineProperties(proxy, {
        status: { get: () => session.status, enumerable: true },
        connection: { get: () => Connection.merge(session.connectionStatus, session.status), enumerable: true },
        peer: { get: () => ({ ...session.peer, muted: session.peerMuted }), enumerable: true },
    });

    return proxy;
}
