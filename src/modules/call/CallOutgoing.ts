import { type CallActive, CallActiveProxy } from "@/modules/call/CallActive";
import type { CallBus } from "@/modules/call/CallBus";
import type { CallPeer } from "@/modules/call/Peer";
import type { Call, CallDirection, CallStatus, CallType } from "@/modules/device/Call";
import type { DeviceSocket } from "@/modules/device/WebSocket";
import type { MediaManager } from "@/modules/media/MediaManager";
import { WebsocketTransport } from "@/modules/media/WebSocket";

export interface CallOutgoing {
    id: string;
    type: CallType;
    direction: CallDirection;
    peer: CallPeer;
    device_token: string;
    status: CallStatus;
    onPeerAccept(callback: (call: CallActive) => void): void;
    onPeerReject(callback: () => void): void;
    onUnanswered(callback: () => void): void;
    onEnd(callback: () => void): void;
    mute(): Promise<{ err: string | null }>;
    unmute(): Promise<{ err: string | null }>;
    end(): Promise<{ err: string | null }>;
    onStatus(cb: (status: CallStatus) => void): void;
}

export function CallOutgoingProxy(
    call: Call,
    bus: CallBus,
    wss: DeviceSocket,
    mediaManager: MediaManager,
    transport: { host: string; port: string },
): CallOutgoing {
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

        onPeerAccept(callback: (call: CallActive) => void): void {
            bus.on("accepted", () => {
                const wsTransport = new WebsocketTransport(mediaManager, transport, call.deviceToken);
                call.accept();
                bus.wireTransport(wsTransport);
                const active = CallActiveProxy(call, bus, wsTransport, mediaManager, {
                    onEnd: () => {
                        wss.emit("call.end", call.id, () => {});
                    },
                });
                wsTransport.start();
                callback(active);
            });
        },

        onPeerReject(callback: () => void): void {
            bus.on("rejected", callback);
        },

        onUnanswered(callback: () => void): void {
            bus.on("unanswered", callback);
        },

        onEnd(callback: () => void): void {
            bus.on("ended", callback);
        },

        onStatus(cb: (status: CallStatus) => void): void {
            bus.on("status", cb);
        },
    };
}
