import type { CallSession } from "@/application/call/CallSession";
import type { ConnectivityIssue, IceDiagnostics } from "@/domain/call/ice";
import type { CallDirection, CallStatus, CallType } from "@/domain/call/types";
import type { Result } from "@/domain/shared/Result";
import type { CallFailureCode, CommandFailure, WavoipError } from "@/domain/shared/errors";
import { type ActiveCall, ActiveCallProxy } from "@/modules/call/ActiveCall";
import { IceTrail } from "@/modules/call/IceTrail";
import type { CallPeer } from "@/modules/call/Peer";
import { EventEmitter, type Unsubscribe } from "@/modules/shared/EventEmitter";

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
    const ice = new IceTrail(session.iceSnapshot);

    session.on("activated", () => emitter.emit("accepted", ActiveCallProxy(session)));
    // A passagem da oferta pré-montada falhou: para quem ligou, a mídia é que não subiu.
    session.on("handoverFailed", (cause) => emitter.emit("failed", { code: "MEDIA_NEGOTIATION_FAILED", cause }));
    session.on("rejected", () => emitter.emit("rejected"));
    session.on("unanswered", () => emitter.emit("unanswered"));
    session.on("failed", (error) => emitter.emit("failed", error));
    session.on("ended", () => emitter.emit("ended"));
    session.on("iceDiagnostics", (diag) => {
        ice.remember(diag);
        emitter.emit("iceDiagnostics", diag);
    });
    session.on("connectivityIssue", (issue) => {
        ice.rememberIssue(issue);
        emitter.emit("connectivityIssue", issue);
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
            const unsub = emitter.on(event, callback);
            ice.replayTo(event, callback as (...args: never[]) => void);
            return unsub;
        },
    } as OutgoingCall;

    // Getters vivos, ver ActiveCall.ts. `peer.muted` fica false enquanto não há mídia.
    Object.defineProperties(proxy, {
        status: { get: () => session.status, enumerable: true },
        peer: { get: () => ({ ...session.peer, muted: false }), enumerable: true },
    });

    return proxy;
}
