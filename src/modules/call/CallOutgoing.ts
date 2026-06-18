import { type CallActive, CallActiveProxy } from "@/modules/call/CallActive";
import type { CallPeer } from "@/modules/call/Peer";
import type { Call, CallDirection, CallStatus, CallType } from "@/modules/device/Call";
import type { DeviceSocket, MediaPlan } from "@/modules/device/WebSocket";
import type { ConnectivityIssue, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
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
    iceDiagnostics: [diag: IceDiagnostics];
    connectivityIssue: [issue: ConnectivityIssue];
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
    wss: DeviceSocket,
    mediaManager: MediaManager,
    preBuiltTransport?: WebRTCTransport,
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
            transport = createTransport(mediaPlan, mediaManager, call.deviceToken);
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
    call.on("status", (status) => {
        emitter.emit("status", status);
    });
    call.on("iceDiagnostics", (diag) => {
        emitter.emit("iceDiagnostics", diag);
    });
    call.on("connectivityIssue", (issue) => {
        emitter.emit("connectivityIssue", issue);
    });

    let onPeerAcceptUnsub: Unsubscribe | undefined;
    let onPeerRejectUnsub: Unsubscribe | undefined;
    let onUnansweredUnsub: Unsubscribe | undefined;
    let onEndUnsub: Unsubscribe | undefined;
    let onStatusUnsub: Unsubscribe | undefined;

    const proxy = {
        id: call.id,
        type: call.type,
        device_token: call.deviceToken,
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

        end(): Promise<{ err: string | null }> {
            return new Promise((resolve) => {
                wss.emit("call.cancel", call.id, async (res) => {
                    call.cancel();
                    await dispose();
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
    } as CallOutgoing;

    // Live getters — see CallActive.ts. `peer.muted` stays false until a transport exists.
    Object.defineProperties(proxy, {
        status: { get: () => call.status, enumerable: true },
        peer: { get: () => ({ ...call.peer, muted: false }), enumerable: true },
    });

    return proxy;
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
