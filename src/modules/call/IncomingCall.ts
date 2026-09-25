import type { CallSession } from "@/application/call/CallSession";
import type { ConnectivityIssue, IceDiagnostics } from "@/domain/call/ice";
import type { CallDirection, CallStatus, CallType } from "@/domain/call/types";
import { Result } from "@/domain/shared/Result";
import type { AcceptFailure, CommandFailure } from "@/domain/shared/errors";
import { type ActiveCall, ActiveCallProxy } from "@/modules/call/ActiveCall";
import { IceTrail } from "@/modules/call/IceTrail";
import type { CallPeer } from "@/modules/call/Peer";
import { EventEmitter, type Unsubscribe } from "@/modules/shared/EventEmitter";

export type IncomingCallEvents = {
    /** Answered on another device linked to the same number. */
    acceptedElsewhere: [];
    /** Declined on another device linked to the same number. */
    rejectedElsewhere: [];
    /** The caller gave up before anyone answered. */
    cancelled: [];
    /** The offer is over: it rang out, or the server closed it. */
    ended: [];
    iceDiagnostics: [diag: IceDiagnostics];
    connectivityIssue: [issue: ConnectivityIssue];
};

export interface IncomingCall {
    id: string;
    type: CallType;
    direction: CallDirection;
    peer: CallPeer;
    deviceToken: string;
    /** Always current, even inside an event handler. */
    status: CallStatus;
    accept(): Promise<Result<ActiveCall, AcceptFailure>>;
    reject(): Promise<Result<void, CommandFailure>>;
    on<T extends keyof IncomingCallEvents>(event: T, callback: (...args: IncomingCallEvents[T]) => void): Unsubscribe;
}

export function IncomingCallProxy(session: CallSession): IncomingCall {
    const emitter = new EventEmitter<IncomingCallEvents>();
    const ice = new IceTrail(session.iceSnapshot);

    const sessionUnsubs: Unsubscribe[] = [];
    const dispose = () => {
        for (const unsub of sessionUnsubs) unsub();
        sessionUnsubs.length = 0;
        emitter.removeAllListeners();
    };

    /** Um desfecho, um evento: o que vier depois não interessa mais a quem recebeu a oferta. */
    const endWith = (event: "acceptedElsewhere" | "rejectedElsewhere" | "cancelled" | "ended") => {
        emitter.emit(event);
        dispose();
    };

    sessionUnsubs.push(session.on("acceptedElsewhere", () => endWith("acceptedElsewhere")));
    sessionUnsubs.push(session.on("rejected", () => endWith("rejectedElsewhere")));
    // O tempo esgotado é o fim da oferta, e não um desfecho à parte.
    sessionUnsubs.push(session.on("unanswered", () => endWith("ended")));
    // Quem cancela é quem ligou, e isso chega como `call:ended` com desfecho CANCELLED.
    sessionUnsubs.push(session.on("ended", () => endWith(session.status === "CANCELLED" ? "cancelled" : "ended")));
    sessionUnsubs.push(
        session.on("iceDiagnostics", (diag) => {
            ice.remember(diag);
            emitter.emit("iceDiagnostics", diag);
        }),
        session.on("connectivityIssue", (issue) => {
            ice.rememberIssue(issue);
            emitter.emit("connectivityIssue", issue);
        }),
    );

    const proxy = {
        id: session.id,
        type: session.type,
        deviceToken: session.deviceToken,
        direction: session.direction,

        async accept(): Promise<Result<ActiveCall, AcceptFailure>> {
            dispose();
            const accepted = await session.accept();
            if (accepted.error) return accepted;
            return Result.ok(ActiveCallProxy(session));
        },

        // A oferta só está recusada quando o servidor confirma; se ele não confirmar, ela
        // continua tocando e o integrador fica sabendo.
        async reject(): Promise<Result<void, CommandFailure>> {
            const rejected = await session.reject();
            if (rejected.error) return rejected;
            dispose();
            return Result.ok();
        },

        on<T extends keyof IncomingCallEvents>(
            event: T,
            callback: (...args: IncomingCallEvents[T]) => void,
        ): Unsubscribe {
            const unsub = emitter.on(event, callback);
            ice.replayTo(event, callback as (...args: never[]) => void);
            return unsub;
        },
    } as IncomingCall;

    // Getters vivos, ver ActiveCall.ts. `peer.muted` fica false enquanto não há mídia.
    Object.defineProperties(proxy, {
        status: { get: () => session.status, enumerable: true },
        peer: { get: () => ({ ...session.peer, muted: false }), enumerable: true },
    });

    return proxy;
}
