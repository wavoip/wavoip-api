import type { CallActive } from "@/modules/call/CallActive";
import type { CallBus } from "@/modules/call/CallBus";
import type { CallPeer } from "@/modules/call/Peer";
import type { Call, CallDirection, CallStatus, CallType } from "@/modules/device/Call";
import { EventEmitter, type Unsubscribe } from "@/modules/shared/EventEmitter";

export type OfferEvents = {
    acceptedElsewhere: [];
    rejectedElsewhere: [];
    unanswered: [];
    ended: [];
    status: [status: CallStatus];
};

export interface Offer {
    id: string;
    type: CallType;
    direction: CallDirection;
    peer: CallPeer;
    device_token: string;
    status: CallStatus;
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
    bus: CallBus,
    callbacks: {
        onAccept: (call: Call) => Promise<CallActive>;
        onReject: (call: Call) => void;
    },
): Offer {
    const emitter = new EventEmitter<OfferEvents>();
    const dispose = () => {
        bus.removeAllListeners();
        emitter.removeAllListeners();
    };

    bus.on("accepted", () => {
        emitter.emit("acceptedElsewhere");
        dispose();
    });
    bus.on("ended", () => {
        emitter.emit("ended");
        dispose();
    });
    bus.on("rejected", () => {
        emitter.emit("rejectedElsewhere");
        dispose();
    });
    bus.on("unanswered", () => {
        emitter.emit("unanswered");
        dispose();
    });
    bus.on("status", (status) => emitter.emit("status", status));

    let onAcceptedElsewhereUnsub: Unsubscribe | undefined;
    let onRejectedElsewhereUnsub: Unsubscribe | undefined;
    let onUnansweredUnsub: Unsubscribe | undefined;
    let onEndUnsub: Unsubscribe | undefined;
    let onStatusUnsub: Unsubscribe | undefined;

    return {
        id: call.id,
        type: call.type,
        device_token: call.deviceToken,
        direction: call.direction,
        status: call.status,
        peer: { ...call.peer, muted: false },

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
            onAcceptedElsewhereUnsub?.();
            onAcceptedElsewhereUnsub = emitter.on("acceptedElsewhere", callback);
        },

        /** @deprecated Use `on("rejectedElsewhere", callback)` instead. */
        onRejectedElsewhere(callback: () => void): void {
            onRejectedElsewhereUnsub?.();
            onRejectedElsewhereUnsub = emitter.on("rejectedElsewhere", callback);
        },

        /** @deprecated Use `on("unanswered", callback)` instead. */
        onUnanswered(cb: () => void): void {
            onUnansweredUnsub?.();
            onUnansweredUnsub = emitter.on("unanswered", cb);
        },

        /** @deprecated Use `on("ended", callback)` instead. */
        onEnd(cb: () => void): void {
            onEndUnsub?.();
            onEndUnsub = emitter.on("ended", cb);
        },

        /** @deprecated Use `on("status", callback)` instead. */
        onStatus(cb: (status: CallStatus) => void): void {
            onStatusUnsub?.();
            onStatusUnsub = emitter.on("status", cb);
        },
    };
}
