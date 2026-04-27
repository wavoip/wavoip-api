import { type CallActive, CallActiveProxy } from "@/modules/call/CallActive";
import type { CallBus } from "@/modules/call/CallBus";
import type { CallPeer } from "@/modules/call/Peer";
import type { Call, CallDirection, CallStatus, CallType } from "@/modules/device/Call";
import type { DeviceSocket, MediaPlan } from "@/modules/device/WebSocket";
import type { ITransport } from "@/modules/media/ITransport";
import type { MediaManager } from "@/modules/media/MediaManager";
import { WebRTCTransport } from "@/modules/media/WebRTC";
import { WebsocketTransport } from "@/modules/media/WebSocket";
import { EventEmitter, type Unsubscribe } from "@/modules/shared/EventEmitter";

export type CallOutgoingEvents = {
    peerAccept: [call: CallActive];
    peerReject: [];
    unanswered: [];
    ended: [];
    status: [status: CallStatus];
};

export interface CallOutgoing {
    id: string;
    type: CallType;
    direction: CallDirection;
    peer: CallPeer;
    device_token: string;
    status: CallStatus;
    on<T extends keyof CallOutgoingEvents>(event: T, callback: (...args: CallOutgoingEvents[T]) => void): Unsubscribe;
    /** @deprecated Use `on("peerAccept", callback)` instead. */
    onPeerAccept(callback: (call: CallActive) => void): void;
    /** @deprecated Use `on("peerReject", callback)` instead. */
    onPeerReject(callback: () => void): void;
    /** @deprecated Use `on("unanswered", callback)` instead. */
    onUnanswered(callback: () => void): void;
    /** @deprecated Use `on("ended", callback)` instead. */
    onEnd(callback: () => void): void;
    mute(): Promise<{ err: string | null }>;
    unmute(): Promise<{ err: string | null }>;
    end(): Promise<{ err: string | null }>;
    /** @deprecated Use `on("status", callback)` instead. */
    onStatus(cb: (status: CallStatus) => void): void;
}

export function CallOutgoingProxy(
    call: Call,
    bus: CallBus,
    wss: DeviceSocket,
    mediaManager: MediaManager,
): CallOutgoing {
    const emitter = new EventEmitter<CallOutgoingEvents>();

    bus.on("answered", async (mediaPlan) => {
        call.accept();
        const transport = createTransport(mediaPlan, mediaManager, call.deviceToken);
        await transport.start();

        if (mediaPlan.type === "webRTC") {
            const answer = await (transport as WebRTCTransport).answer;
            wss.emit("call.accept", call.id, { type: "webRTC", sdp: answer.sdp as string }, () => {});
        }

        bus.wireTransport(transport);
        const active = CallActiveProxy(call, bus, transport, mediaManager, {
            onEnd: () => {
                wss.emit("call.end", call.id, () => {});
            },
        });
        emitter.emit("peerAccept", active);
    });
    bus.on("rejected", () => {
        emitter.emit("peerReject");
    });
    bus.on("unanswered", () => {
        emitter.emit("unanswered");
    });
    bus.on("ended", () => {
        emitter.emit("ended");
    });
    bus.on("status", (status) => {
        emitter.emit("status", status);
    });

    let onPeerAcceptUnsub: Unsubscribe | undefined;
    let onPeerRejectUnsub: Unsubscribe | undefined;
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

        mute(): Promise<{ err: string | null }> {
            return new Promise((resolve) => {
                wss.emit("call.mute", call.id, true, (res) => {
                    if (res.type === "success") mediaManager.setMuted(true);
                    resolve(res.type === "error" ? { err: res.result } : { err: null });
                });
            });
        },

        unmute(): Promise<{ err: string | null }> {
            return new Promise((resolve) => {
                wss.emit("call.mute", call.id, false, (res) => {
                    if (res.type === "success") mediaManager.setMuted(false);
                    resolve(res.type === "error" ? { err: res.result } : { err: null });
                });
            });
        },

        end(): Promise<{ err: string | null }> {
            return new Promise((resolve) => {
                wss.emit("call.end", call.id, (res) => {
                    call.end();
                    resolve(res.type === "error" ? { err: res.result } : { err: null });
                });
            });
        },

        on<T extends keyof CallOutgoingEvents>(
            event: T,
            callback: (...args: CallOutgoingEvents[T]) => void,
        ): Unsubscribe {
            return emitter.on(event, callback);
        },

        /** @deprecated Use `on("peerAccept", callback)` instead. */
        onPeerAccept(callback: (call: CallActive) => void): void {
            onPeerAcceptUnsub?.();
            onPeerAcceptUnsub = emitter.on("peerAccept", callback);
        },

        /** @deprecated Use `on("peerReject", callback)` instead. */
        onPeerReject(callback: () => void): void {
            onPeerRejectUnsub?.();
            onPeerRejectUnsub = emitter.on("peerReject", callback);
        },

        /** @deprecated Use `on("unanswered", callback)` instead. */
        onUnanswered(callback: () => void): void {
            onUnansweredUnsub?.();
            onUnansweredUnsub = emitter.on("unanswered", callback);
        },

        /** @deprecated Use `on("ended", callback)` instead. */
        onEnd(callback: () => void): void {
            onEndUnsub?.();
            onEndUnsub = emitter.on("ended", callback);
        },

        /** @deprecated Use `on("status", callback)` instead. */
        onStatus(cb: (status: CallStatus) => void): void {
            onStatusUnsub?.();
            onStatusUnsub = emitter.on("status", cb);
        },
    };
}

function createTransport(mediaPlan: MediaPlan, mediaManager: MediaManager, deviceToken: string): ITransport {
    if (mediaPlan.type === "webRTC") {
        return new WebRTCTransport(mediaManager, mediaPlan.sdp);
    }

    if (mediaPlan.type === "relay") {
        return new WebsocketTransport(mediaManager, mediaPlan, deviceToken);
    }

    throw new Error(`Unsupported media plan type: ${mediaPlan.type}`);
}
