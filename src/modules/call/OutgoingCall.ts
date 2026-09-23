import type { CallSession, CallSessionEvents } from "@/application/call/CallSession";
import type { ConnectivityIssue, IceDiagnostics } from "@/domain/call/ice";
import type { CallDirection, CallStatus, CallType } from "@/domain/call/types";
import type { CallFailureCode, CommandFailure, WavoipError } from "@/domain/shared/errors";
import type { Result } from "@/domain/shared/Result";
import { type ActiveCall, ActiveCallProxy } from "@/modules/call/ActiveCall";
import type { CallPeer } from "@/modules/call/Peer";
import { EventEmitter, type Unsubscribe } from "@/modules/shared/EventEmitter";
import { forwardEvents } from "@/modules/shared/forwardEvents";

export type OutgoingCallFailure = WavoipError<CallFailureCode | "MEDIA_NEGOTIATION_FAILED" | "UNKNOWN">;

export type OutgoingCallEvents = {
    /** The peer picked up: from here on, the call lives in the `ActiveCall`. */
    accepted: [call: ActiveCall];
    /** The peer declined. */
    rejected: [];
    /** Nobody picked up before the offer rang out. */
    unanswered: [];
    /** The call died on its way up. */
    failed: [error: OutgoingCallFailure];
    /** The server closed the offer — a restart or a hibernating device, for instance. */
    ended: [];
    iceDiagnostics: [diag: IceDiagnostics];
    connectivityIssue: [issue: ConnectivityIssue];
};

export interface OutgoingCall {
    id: string;
    type: CallType;
    direction: CallDirection;
    peer: CallPeer;
    deviceToken: string;
    /** Always current, even inside an event handler. */
    status: CallStatus;
    mute(): Promise<Result<void, CommandFailure>>;
    unmute(): Promise<Result<void, CommandFailure>>;
    /** Gives up the call before the peer answers. */
    cancel(): Promise<Result<void, CommandFailure>>;
    on<T extends keyof OutgoingCallEvents>(event: T, callback: (...args: OutgoingCallEvents[T]) => void): Unsubscribe;
}

export function OutgoingCallProxy(session: CallSession): OutgoingCall {
    const emitter = new EventEmitter<OutgoingCallEvents>();

    session.on("activated", () => emitter.emit("accepted", ActiveCallProxy(session)));
    // A passagem da oferta pré-montada falhou: para quem ligou, a mídia é que não subiu.
    session.on("handoverFailed", () => emitter.emit("failed", { code: "MEDIA_NEGOTIATION_FAILED" }));
    session.on("rejected", () => emitter.emit("rejected"));
    session.on("unanswered", () => emitter.emit("unanswered"));
    session.on("failed", (error) => emitter.emit("failed", error));
    session.on("ended", () => emitter.emit("ended"));
    forwardEvents<CallSessionEvents, OutgoingCallEvents>(session, emitter, {
        iceDiagnostics: "iceDiagnostics",
        connectivityIssue: "connectivityIssue",
    });

    const proxy = {
        id: session.id,
        type: session.type,
        deviceToken: session.deviceToken,
        direction: session.direction,

        mute(): Promise<Result<void, CommandFailure>> {
            return session.mute(true);
        },

        unmute(): Promise<Result<void, CommandFailure>> {
            return session.mute(false);
        },

        cancel(): Promise<Result<void, CommandFailure>> {
            return session.cancel();
        },

        on<T extends keyof OutgoingCallEvents>(
            event: T,
            callback: (...args: OutgoingCallEvents[T]) => void,
        ): Unsubscribe {
            return emitter.on(event, callback);
        },
    } as OutgoingCall;

    // Getters vivos, ver ActiveCall.ts. `peer.muted` fica false enquanto não há mídia.
    Object.defineProperties(proxy, {
        status: { get: () => session.status, enumerable: true },
        peer: { get: () => ({ ...session.peer, muted: false }), enumerable: true },
    });

    return proxy;
}
