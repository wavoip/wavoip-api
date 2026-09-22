import { CallPolicy } from "@/domain/call/policy";
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
            // `disposed` só é marcado depois da passagem dar certo: marcado antes, uma exceção
            // no meio do await deixaria o preBuiltTransport órfão (microfone vivo, pc aberto),
            // porque o dispose() seguinte pararia na flag (B7).
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
    forwardEvents(call, emitter, {
        status: "status",
        iceDiagnostics: "iceDiagnostics",
        connectivityIssue: "connectivityIssue",
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
         * A mídia é liberada em todo desfecho **menos no que a chamada continua viva**
         * (`CallPolicy.alreadyAnswered`): derrubar o transporte ali deixava uma chamada
         * conectada muda.
         *
         * `ACK_TIMEOUT` é o "não sabemos" honesto: o socket.io descarta o pacote em buffer
         * quando o timer vence, então o servidor pode nunca ter visto o cancelamento e o
         * outro lado pode estar tocando ainda. O transporte fica justamente porque a
         * chamada ainda pode ser atendida.
         */
        cancel(): Promise<{ err: string | null }> {
            return new Promise((resolve) => {
                wss.timeout(CallPolicy.ackTimeoutMs).emit("call.cancel", call.id, async (timeoutErr, res) => {
                    if (timeoutErr) return resolve({ err: "ACK_TIMEOUT" });
                    if (res.type === "error") {
                        if (res.result !== CallPolicy.alreadyAnswered) await dispose();
                        return resolve({ err: res.result });
                    }

                    // O servidor já recusa cancelar uma chamada ACTIVE com IS_NOT_OFFER; uma
                    // transição local que não se aplica quer dizer que os dois discordam, e
                    // a mídia não cai com base num ack que não dá para honrar.
                    if (!call.cancel()) return resolve({ err: "IS_NOT_OFFER" });
                    await dispose();
                    resolve({ err: null });
                });
            });
        },

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

        onPeerAccept(callback: (call: CallActive) => void): void {
            warnDeprecated("CallOutgoing.onPeerAccept", 'use `outgoing.on("peerAccept", cb)` instead.');
            onPeerAcceptUnsub?.();
            onPeerAcceptUnsub = emitter.on("peerAccept", callback);
        },

        onPeerReject(callback: () => void): void {
            warnDeprecated("CallOutgoing.onPeerReject", 'use `outgoing.on("peerReject", cb)` instead.');
            onPeerRejectUnsub?.();
            onPeerRejectUnsub = emitter.on("peerReject", callback);
        },

        onUnanswered(callback: () => void): void {
            warnDeprecated("CallOutgoing.onUnanswered", 'use `outgoing.on("unanswered", cb)` instead.');
            onUnansweredUnsub?.();
            onUnansweredUnsub = emitter.on("unanswered", callback);
        },

        onEnd(callback: () => void): void {
            warnDeprecated("CallOutgoing.onEnd", 'use `outgoing.on("ended", cb)` instead.');
            onEndUnsub?.();
            onEndUnsub = emitter.on("ended", callback);
        },

        onStatus(cb: (status: CallStatus) => void): void {
            warnDeprecated("CallOutgoing.onStatus", 'use `outgoing.on("status", cb)` instead.');
            onStatusUnsub?.();
            onStatusUnsub = emitter.on("status", cb);
        },
    } as CallOutgoing;

    // Getters vivos, ver CallActive.ts. `peer.muted` fica false enquanto não há transporte.
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
