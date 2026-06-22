import type { CallActive } from "@/modules/call/CallActive";
import type { CallPeer } from "@/modules/call/Peer";
import type { Call, CallDirection, CallStatus, CallType } from "@/modules/device/Call";
import type { ConnectivityIssue, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
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

export function OfferProxy(
    call: Call,
    callbacks: {
        onAccept: (call: Call) => Promise<CallActive>;
        onReject: (call: Call) => void;
    },
): Offer {
    const emitter = new EventEmitter<OfferEvents>();

    const callUnsubs: Unsubscribe[] = [];
    const dispose = () => {
        for (const u of callUnsubs) u();
        callUnsubs.length = 0;
        emitter.removeAllListeners();
    };

    callUnsubs.push(
        call.on("accepted", () => {
            emitter.emit("acceptedElsewhere");
            dispose();
        }),
    );
    callUnsubs.push(
        call.on("ended", () => {
            emitter.emit("ended");
            dispose();
        }),
    );
    callUnsubs.push(
        call.on("rejected", () => {
            emitter.emit("rejectedElsewhere");
            dispose();
        }),
    );
    callUnsubs.push(
        call.on("unanswered", () => {
            emitter.emit("unanswered");
            dispose();
        }),
    );
    callUnsubs.push(
        forwardEvents(call, emitter, {
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
        id: call.id,
        type: call.type,
        deviceToken: call.deviceToken,
        direction: call.direction,

        async accept(): Promise<{ call: CallActive; err: null } | { call: null; err: string }> {
            try {
                dispose();
                const active = await callbacks.onAccept(call);
                return { call: active, err: null };
            } catch (e) {
                return { call: null, err: String(e) };
            }
        },

        async reject(): Promise<{ err: string | null }> {
            callbacks.onReject(call);
            dispose();
            return { err: null };
        },

        on<T extends keyof OfferEvents>(event: T, callback: (...args: OfferEvents[T]) => void): Unsubscribe {
            return emitter.on(event, callback);
        },

        /** @deprecated Use `on("acceptedElsewhere", callback)` instead. */
        onAcceptedElsewhere(callback: () => void): void {
            warnDeprecated("Offer.onAcceptedElsewhere", 'use `offer.on("acceptedElsewhere", cb)` instead.');
            onAcceptedElsewhereUnsub?.();
            onAcceptedElsewhereUnsub = emitter.on("acceptedElsewhere", callback);
        },

        /** @deprecated Use `on("rejectedElsewhere", callback)` instead. */
        onRejectedElsewhere(callback: () => void): void {
            warnDeprecated("Offer.onRejectedElsewhere", 'use `offer.on("rejectedElsewhere", cb)` instead.');
            onRejectedElsewhereUnsub?.();
            onRejectedElsewhereUnsub = emitter.on("rejectedElsewhere", callback);
        },

        /** @deprecated Use `on("unanswered", callback)` instead. */
        onUnanswered(cb: () => void): void {
            warnDeprecated("Offer.onUnanswered", 'use `offer.on("unanswered", cb)` instead.');
            onUnansweredUnsub?.();
            onUnansweredUnsub = emitter.on("unanswered", cb);
        },

        /** @deprecated Use `on("ended", callback)` instead. */
        onEnd(cb: () => void): void {
            warnDeprecated("Offer.onEnd", 'use `offer.on("ended", cb)` instead.');
            onEndUnsub?.();
            onEndUnsub = emitter.on("ended", cb);
        },

        /** @deprecated Use `on("status", callback)` instead. */
        onStatus(cb: (status: CallStatus) => void): void {
            warnDeprecated("Offer.onStatus", 'use `offer.on("status", cb)` instead.');
            onStatusUnsub?.();
            onStatusUnsub = emitter.on("status", cb);
        },
    } as Offer;

    // Live getters — see CallActive.ts.
    Object.defineProperties(proxy, {
        status: { get: () => call.status, enumerable: true },
        peer: { get: () => ({ ...call.peer, muted: false }), enumerable: true },
        device_token: {
            get: () => {
                warnDeprecated("Offer.device_token", "use `offer.deviceToken` instead.");
                return call.deviceToken;
            },
            enumerable: true,
        },
    });

    return proxy;
}
