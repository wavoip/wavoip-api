import type { CallActive } from "@/modules/call/CallActive";
import type { CallBus } from "@/modules/call/CallBus";
import type { CallPeer } from "@/modules/call/Peer";
import type { Call, CallDirection, CallStatus, CallType } from "@/modules/device/Call";

export interface Offer {
    id: string;
    type: CallType;
    direction: CallDirection;
    peer: CallPeer;
    device_token: string;
    status: CallStatus;
    accept(): Promise<{ call: CallActive; err: null } | { call: null; err: string }>;
    reject(): Promise<{ err: null | string }>;
    onAcceptedElsewhere(callback: () => void): void;
    onRejectedElsewhere(callback: () => void): void;
    onUnanswered(cb: () => void): void;
    onEnd(cb: () => void): void;
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
    return {
        id: call.id,
        type: call.type,
        device_token: call.deviceToken,
        direction: call.direction,
        status: call.status,
        peer: { ...call.peer, muted: false },

        async accept(): Promise<{ call: CallActive; err: null } | { call: null; err: string }> {
            try {
                const active = await callbacks.onAccept(call);
                return { call: active, err: null };
            } catch (e) {
                return { call: null, err: String(e) };
            }
        },

        async reject(): Promise<{ err: string | null }> {
            callbacks.onReject(call);
            return { err: null };
        },

        onAcceptedElsewhere(callback: () => void): void {
            bus.on("ended", callback);
        },

        onRejectedElsewhere(callback: () => void): void {
            bus.on("rejected", callback);
        },

        onUnanswered(cb: () => void): void {
            bus.on("unanswered", cb);
        },

        onEnd(cb: () => void): void {
            bus.on("ended", cb);
        },

        onStatus(cb: (status: CallStatus) => void): void {
            bus.on("status", cb);
        },
    };
}
