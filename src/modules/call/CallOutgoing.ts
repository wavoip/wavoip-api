import { type CallActive, CallActiveProxy } from "@/modules/call/CallActive";
import type { CallPeer } from "@/modules/call/Peer";
import type { CallSession, CallSessionEvents } from "@/application/call/CallSession";
import type { ConnectivityIssue, IceDiagnostics } from "@/domain/call/ice";
import type { CallDirection, CallStatus, CallType } from "@/domain/call/types";
import { toLegacy } from "@/modules/call/legacyResult";
import { EventEmitter, type Unsubscribe } from "@/modules/shared/EventEmitter";
import { forwardEvents } from "@/modules/shared/forwardEvents";

export type CallOutgoingEvents = {
    peerAccept: [call: CallActive];
    peerReject: [];
    unanswered: [];
    ended: [];
    status: [status: CallStatus];
    iceDiagnostics: [diag: IceDiagnostics];
    connectivityIssue: [issue: ConnectivityIssue];
};

export interface CallOutgoing {
    id: string;
    type: CallType;
    direction: CallDirection;
    peer: CallPeer;
    deviceToken: string;
    status: CallStatus;
    mute(): Promise<{ err: string | null }>;
    unmute(): Promise<{ err: string | null }>;
    /** Gives up the call before the peer answers. */
    cancel(): Promise<{ err: string | null }>;
    on<T extends keyof CallOutgoingEvents>(event: T, callback: (...args: CallOutgoingEvents[T]) => void): Unsubscribe;
}

export function CallOutgoingProxy(session: CallSession): CallOutgoing {
    const emitter = new EventEmitter<CallOutgoingEvents>();

    session.on("activated", () => emitter.emit("peerAccept", CallActiveProxy(session)));
    // A passagem da oferta pré-montada falhou: para quem ligou, a chamada acabou.
    session.on("handoverFailed", () => emitter.emit("ended"));
    session.on("rejected", () => emitter.emit("peerReject"));
    session.on("unanswered", () => emitter.emit("unanswered"));
    session.on("ended", () => emitter.emit("ended"));
    forwardEvents<CallSessionEvents, CallOutgoingEvents>(session, emitter, {
        status: "status",
        iceDiagnostics: "iceDiagnostics",
        connectivityIssue: "connectivityIssue",
    });

    const proxy = {
        id: session.id,
        type: session.type,
        deviceToken: session.deviceToken,
        direction: session.direction,

        async mute(): Promise<{ err: string | null }> {
            return toLegacy(await session.mute(true));
        },

        async unmute(): Promise<{ err: string | null }> {
            return toLegacy(await session.mute(false));
        },

        async cancel(): Promise<{ err: string | null }> {
            return toLegacy(await session.cancel());
        },

        on<T extends keyof CallOutgoingEvents>(
            event: T,
            callback: (...args: CallOutgoingEvents[T]) => void,
        ): Unsubscribe {
            return emitter.on(event, callback);
        },
    } as CallOutgoing;

    // Getters vivos, ver CallActive.ts. `peer.muted` fica false enquanto não há mídia.
    Object.defineProperties(proxy, {
        status: { get: () => session.status, enumerable: true },
        peer: { get: () => ({ ...session.peer, muted: false }), enumerable: true },
    });

    return proxy;
}
