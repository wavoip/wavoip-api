import { type CallActive, CallActiveProxy } from "@/modules/call/CallActive";
import type { CallPeer } from "@/modules/call/Peer";
import type { CallSession, CallSessionEvents } from "@/application/call/CallSession";
import type { CallDirection, CallStatus, CallType } from "@/domain/call/types";
import type { ConnectivityIssue, IceDiagnostics } from "@/domain/call/ice";
import { legacyMessage } from "@/modules/call/legacyResult";
import { warnDeprecated } from "@/modules/shared/deprecation";
import { EventEmitter, type Unsubscribe } from "@/modules/shared/EventEmitter";
import { forwardEvents } from "@/modules/shared/forwardEvents";

export type OfferEvents = {
    acceptedElsewhere: [];
    rejectedElsewhere: [];
    unanswered: [];
    ended: [];
    status: [status: CallStatus];
    iceDiagnostics: [diag: IceDiagnostics];
    connectivityIssue: [issue: ConnectivityIssue];
};

export interface Offer {
    id: string;
    type: CallType;
    direction: CallDirection;
    peer: CallPeer;
    deviceToken: string;
    status: CallStatus;
    /** @deprecated Use `deviceToken` instead. */
    device_token: string;
    accept(): Promise<{ call: CallActive; err: null } | { call: null; err: string }>;
    reject(): Promise<{ err: null | string }>;
    on<T extends keyof OfferEvents>(event: T, callback: (...args: OfferEvents[T]) => void): Unsubscribe;
    /** @deprecated Use `on("acceptedElsewhere", callback)` instead. */
    onAcceptedElsewhere(callback: () => void): void;
    /** @deprecated Use `on("rejectedElsewhere", callback)` instead. */
    onRejectedElsewhere(callback: () => void): void;
    /** @deprecated Use `on("unanswered", callback)` instead. */
    onUnanswered(cb: () => void): void;
    /** @deprecated Use `on("ended", callback)` instead. */
    onEnd(cb: () => void): void;
    /** @deprecated Use `on("status", callback)` instead. */
    onStatus(cb: (status: CallStatus) => void): void;
}

export function OfferProxy(session: CallSession, release: () => void): Offer {
    const emitter = new EventEmitter<OfferEvents>();

    const sessionUnsubs: Unsubscribe[] = [];
    const dispose = () => {
        for (const unsub of sessionUnsubs) unsub();
        sessionUnsubs.length = 0;
        emitter.removeAllListeners();
    };

    const endWith = (event: "acceptedElsewhere" | "rejectedElsewhere" | "unanswered" | "ended") => {
        emitter.emit(event);
        dispose();
    };

    sessionUnsubs.push(session.on("acceptedElsewhere", () => endWith("acceptedElsewhere")));
    sessionUnsubs.push(session.on("rejected", () => endWith("rejectedElsewhere")));
    sessionUnsubs.push(session.on("unanswered", () => endWith("unanswered")));
    sessionUnsubs.push(session.on("ended", () => endWith("ended")));
    sessionUnsubs.push(
        forwardEvents<CallSessionEvents, OfferEvents>(session, emitter, {
            status: "status",
            iceDiagnostics: "iceDiagnostics",
            connectivityIssue: "connectivityIssue",
        }),
    );

    let onAcceptedElsewhereUnsub: Unsubscribe | undefined;
    let onRejectedElsewhereUnsub: Unsubscribe | undefined;
    let onUnansweredUnsub: Unsubscribe | undefined;
    let onEndUnsub: Unsubscribe | undefined;
    let onStatusUnsub: Unsubscribe | undefined;

    const proxy = {
        id: session.id,
        type: session.type,
        deviceToken: session.deviceToken,
        direction: session.direction,

        async accept(): Promise<{ call: CallActive; err: null } | { call: null; err: string }> {
            dispose();
            const accepted = await session.accept();
            if (accepted.error) return { call: null, err: legacyMessage(accepted.error) };
            return { call: CallActiveProxy(session), err: null };
        },

        // A oferta só sai do roteamento quando o servidor confirma a recusa; se ele não
        // confirmar, ela continua tocando e o integrador fica sabendo.
        async reject(): Promise<{ err: string | null }> {
            const rejected = await session.reject();
            if (rejected.error) return { err: rejected.error.code };
            release();
            dispose();
            return { err: null };
        },

        on<T extends keyof OfferEvents>(event: T, callback: (...args: OfferEvents[T]) => void): Unsubscribe {
            return emitter.on(event, callback);
        },

        onAcceptedElsewhere(callback: () => void): void {
            warnDeprecated("Offer.onAcceptedElsewhere", 'use `offer.on("acceptedElsewhere", cb)` instead.');
            onAcceptedElsewhereUnsub?.();
            onAcceptedElsewhereUnsub = emitter.on("acceptedElsewhere", callback);
        },

        onRejectedElsewhere(callback: () => void): void {
            warnDeprecated("Offer.onRejectedElsewhere", 'use `offer.on("rejectedElsewhere", cb)` instead.');
            onRejectedElsewhereUnsub?.();
            onRejectedElsewhereUnsub = emitter.on("rejectedElsewhere", callback);
        },

        onUnanswered(cb: () => void): void {
            warnDeprecated("Offer.onUnanswered", 'use `offer.on("unanswered", cb)` instead.');
            onUnansweredUnsub?.();
            onUnansweredUnsub = emitter.on("unanswered", cb);
        },

        onEnd(cb: () => void): void {
            warnDeprecated("Offer.onEnd", 'use `offer.on("ended", cb)` instead.');
            onEndUnsub?.();
            onEndUnsub = emitter.on("ended", cb);
        },

        onStatus(cb: (status: CallStatus) => void): void {
            warnDeprecated("Offer.onStatus", 'use `offer.on("status", cb)` instead.');
            onStatusUnsub?.();
            onStatusUnsub = emitter.on("status", cb);
        },
    } as Offer;

    // Getters vivos, ver CallActive.ts. `peer.muted` fica false enquanto não há mídia.
    Object.defineProperties(proxy, {
        status: { get: () => session.status, enumerable: true },
        peer: { get: () => ({ ...session.peer, muted: false }), enumerable: true },
        device_token: {
            get: () => {
                warnDeprecated("Offer.device_token", "use `offer.deviceToken` instead.");
                return session.deviceToken;
            },
            enumerable: true,
        },
    });

    return proxy;
}
