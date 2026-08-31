import { type CallActive, CallActiveProxy } from "@/modules/call/CallActive";
import type { CallPeer } from "@/modules/call/Peer";
import type { Call, CallDirection, CallStatus, CallType } from "@/modules/device/Call";
import type { DeviceSocket, MediaPlan } from "@/modules/device/WebSocket";
import type { ConnectivityIssue, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import type { ITransport, TransportOptions } from "@/modules/media/ITransport";
import type { MediaManager } from "@/modules/media/MediaManager";
import { WebRTCTransport } from "@/modules/media/WebRTC";
import { WebsocketTransport } from "@/modules/media/WebSocket";
import { warnDeprecated } from "@/modules/shared/deprecation";
import { EventEmitter, type Unsubscribe } from "@/modules/shared/EventEmitter";
import { forwardEvents } from "@/modules/shared/forwardEvents";

/**
 * Ceiling for the `call.cancel` ack. A dropped socket buffers the emit and the
 * callback never runs; with no ceiling the Promise stays pending forever and the UI
 * locks on "cancelling".
 */
const ACK_TIMEOUT_MS = 10_000;

/**
 * The one refusal that means the call is still up: the peer answered between the
 * click and the ack. Everything else is a dead call, and the media goes with it.
 */
const CALL_ALREADY_ANSWERED = "IS_NOT_OFFER";

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
    /** @deprecated Use `deviceToken` instead. */
    device_token: string;
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
    /** Gives up the call before the peer answers. */
    cancel(): Promise<{ err: string | null }>;
    /** @deprecated Use `cancel()` instead. */
    end(): Promise<{ err: string | null }>;
    /** @deprecated Use `on("status", callback)` instead. */
    onStatus(cb: (status: CallStatus) => void): void;
}

export function CallOutgoingProxy(
    call: Call,
    wss: DeviceSocket,
    mediaManager: MediaManager,
    preBuiltTransport?: WebRTCTransport,
    transportOptions?: TransportOptions,
): CallOutgoing {
    const emitter = new EventEmitter<CallOutgoingEvents>();

    let disposed = false;
    const dispose = (): Promise<void> => {
        if (disposed) return Promise.resolve();
        disposed = true;
        if (!preBuiltTransport) return Promise.resolve();
        return Promise.resolve(preBuiltTransport.stop()).catch(() => {});
    };

    call.on("answered", async (mediaPlan) => {
        call.accept();

        let transport: ITransport;
        if (preBuiltTransport && mediaPlan.type === "webRTC") {
            // Defer marking `disposed` until handover succeeds. Otherwise a throw
            // mid-await leaves preBuiltTransport orphaned (mic stream live, pc open)
            // because the later dispose() short-circuits on the flag (B7).
            try {
                await preBuiltTransport.setAnswer(mediaPlan.sdp);
                await preBuiltTransport.start();
            } catch {
                await preBuiltTransport.stop().catch(() => {});
                disposed = true;
                emitter.emit("ended");
                return;
            }
            disposed = true;
            transport = preBuiltTransport;
        } else {
            await dispose();
            transport = createTransport(mediaPlan, mediaManager, call.deviceToken, transportOptions);
            await transport.start();

            if (mediaPlan.type === "webRTC") {
                const answer = await (transport as WebRTCTransport).answer;
                wss.emit("call.accept", call.id, { type: "webRTC", sdp: answer.sdp as string }, () => {});
            }
        }

        call.wireTransport(transport);
        const active = CallActiveProxy(call, transport, mediaManager, {
            onEnd: () => {
                wss.emit("call.end", call.id, () => {});
            },
        });
        emitter.emit("peerAccept", active);
    });
    // Pure 1:1 relays.
    forwardEvents(call, emitter, {
        status: "status",
        iceDiagnostics: "iceDiagnostics",
        connectivityIssue: "connectivityIssue",
    });

    // Side-effecting (dispose, rename) stay inline.
    call.on("rejected", () => {
        emitter.emit("peerReject");
        void dispose();
    });
    call.on("unanswered", () => {
        emitter.emit("unanswered");
        void dispose();
    });
    call.on("ended", () => {
        emitter.emit("ended");
        void dispose();
    });

    let onPeerAcceptUnsub: Unsubscribe | undefined;
    let onPeerRejectUnsub: Unsubscribe | undefined;
    let onUnansweredUnsub: Unsubscribe | undefined;
    let onEndUnsub: Unsubscribe | undefined;
    let onStatusUnsub: Unsubscribe | undefined;

    const proxy = {
        id: call.id,
        type: call.type,
        deviceToken: call.deviceToken,
        direction: call.direction,

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

        /**
         * Gives up the call before the peer answers. The name matches the
         * `call.cancel` that has always gone over the wire.
         *
         * The media is released on every outcome **except the one where the call is
         * still alive**: `IS_NOT_OFFER` means the peer answered in the same instant,
         * and tearing the transport down there left a connected call mute — which is
         * what the unconditional teardown this replaces used to do. Any other refusal
         * (unknown id after an instance restart, internal error) leaves nothing to
         * keep alive, so the microphone is freed rather than leaked.
         *
         * `ACK_TIMEOUT` is the honest "we do not know" answer: socket.io drops the
         * buffered packet when the timer fires, so the server may never have seen the
         * cancel and the peer may still be ringing. The transport is kept precisely
         * because the call can still be answered.
         *
         * @example await outgoing.cancel()
         */
        cancel(): Promise<{ err: string | null }> {
            return new Promise((resolve) => {
                wss.timeout(ACK_TIMEOUT_MS).emit("call.cancel", call.id, async (timeoutErr, res) => {
                    if (timeoutErr) return resolve({ err: "ACK_TIMEOUT" });
                    if (res.type === "error") {
                        if (res.result !== CALL_ALREADY_ANSWERED) await dispose();
                        return resolve({ err: res.result });
                    }

                    // Defence in depth: the server already refuses a cancel on an
                    // ACTIVE call with IS_NOT_OFFER, so a local transition that will
                    // not apply means the two disagree — do not tear the media down
                    // on the strength of an ack we cannot honour.
                    if (!call.cancel()) return resolve({ err: "IS_NOT_OFFER" });
                    await dispose();
                    resolve({ err: null });
                });
            });
        },

        /** @deprecated Use `cancel()` instead — same behaviour, name that matches the wire. */
        end(): Promise<{ err: string | null }> {
            warnDeprecated("CallOutgoing.end", "use `outgoing.cancel()` instead.");
            return proxy.cancel();
        },

        on<T extends keyof CallOutgoingEvents>(
            event: T,
            callback: (...args: CallOutgoingEvents[T]) => void,
        ): Unsubscribe {
            return emitter.on(event, callback);
        },

        /** @deprecated Use `on("peerAccept", callback)` instead. */
        onPeerAccept(callback: (call: CallActive) => void): void {
            warnDeprecated("CallOutgoing.onPeerAccept", 'use `outgoing.on("peerAccept", cb)` instead.');
            onPeerAcceptUnsub?.();
            onPeerAcceptUnsub = emitter.on("peerAccept", callback);
        },

        /** @deprecated Use `on("peerReject", callback)` instead. */
        onPeerReject(callback: () => void): void {
            warnDeprecated("CallOutgoing.onPeerReject", 'use `outgoing.on("peerReject", cb)` instead.');
            onPeerRejectUnsub?.();
            onPeerRejectUnsub = emitter.on("peerReject", callback);
        },

        /** @deprecated Use `on("unanswered", callback)` instead. */
        onUnanswered(callback: () => void): void {
            warnDeprecated("CallOutgoing.onUnanswered", 'use `outgoing.on("unanswered", cb)` instead.');
            onUnansweredUnsub?.();
            onUnansweredUnsub = emitter.on("unanswered", callback);
        },

        /** @deprecated Use `on("ended", callback)` instead. */
        onEnd(callback: () => void): void {
            warnDeprecated("CallOutgoing.onEnd", 'use `outgoing.on("ended", cb)` instead.');
            onEndUnsub?.();
            onEndUnsub = emitter.on("ended", callback);
        },

        /** @deprecated Use `on("status", callback)` instead. */
        onStatus(cb: (status: CallStatus) => void): void {
            warnDeprecated("CallOutgoing.onStatus", 'use `outgoing.on("status", cb)` instead.');
            onStatusUnsub?.();
            onStatusUnsub = emitter.on("status", cb);
        },
    } as CallOutgoing;

    // Live getters — see CallActive.ts. `peer.muted` stays false until a transport exists.
    Object.defineProperties(proxy, {
        status: { get: () => call.status, enumerable: true },
        peer: { get: () => ({ ...call.peer, muted: false }), enumerable: true },
        device_token: {
            get: () => {
                warnDeprecated("CallOutgoing.device_token", "use `outgoing.deviceToken` instead.");
                return call.deviceToken;
            },
            enumerable: true,
        },
    });

    return proxy;
}

function createTransport(
    mediaPlan: MediaPlan,
    mediaManager: MediaManager,
    deviceToken: string,
    transportOptions?: TransportOptions,
): ITransport {
    if (mediaPlan.type === "webRTC") {
        return new WebRTCTransport(mediaManager, mediaPlan.sdp, transportOptions);
    }

    if (mediaPlan.type === "relay") {
        return new WebsocketTransport(mediaManager, mediaPlan, deviceToken, transportOptions);
    }

    throw new Error(`Unsupported media plan type: ${mediaPlan.type}`);
}
