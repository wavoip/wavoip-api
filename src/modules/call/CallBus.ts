import type { CallStats } from "@/modules/call/Stats";
import type { Call, CallStatus } from "@/modules/device/Call";
import type { DeviceSocket, MediaPlan } from "@/modules/device/WebSocket";
import type { ITransport, TransportStatus } from "@/modules/media/ITransport";
import { EventEmitter } from "@/modules/shared/EventEmitter";

type CallBusEvents = {
    status: [status: CallStatus];
    ended: [];
    accepted: [];
    answered: [mediaPlan: MediaPlan];
    rejected: [];
    unanswered: [];
    failed: [error: string];
    connectionStatus: [status: TransportStatus];
    peerMuted: [muted: boolean];
    stats: [stats: CallStats];
};

/**
 * Internal normalized event bus for a single call.
 * Aggregates raw events from DeviceSocket and ITransport into a single
 * typed stream so facades (Offer, CallOutgoing, CallActive) only depend
 * on this one class instead of wiring socket/transport listeners themselves.
 */
export class CallBus extends EventEmitter<CallBusEvents> {
    constructor(call: Call, socket: DeviceSocket, transport?: ITransport) {
        super();

        socket.on("call:ended", (id) => {
            if (id === call.id) this.emit("ended");
        });
        socket.on("call:accepted", (id) => {
            if (id === call.id) this.emit("accepted");
        });
        socket.on("call:answered", (id, mediaPlan) => {
            if (id === call.id) this.emit("answered", mediaPlan);
        });
        socket.on("call:unanswered", (id) => {
            if (id === call.id) this.emit("unanswered");
        });
        socket.on("call:rejected", (id) => {
            if (id === call.id) this.emit("rejected");
        });
        socket.on("call:failed", (id, err) => {
            if (id === call.id) this.emit("failed", err);
        });

        if (transport) this.wireTransport(transport);
    }

    /**
     * Attach a transport after construction (e.g. once a call is accepted
     * and the WebRTC/WebSocket transport is ready).
     */
    wireTransport(transport: ITransport): void {
        transport.on("statusChanged", (s) => {
            this.emit("connectionStatus", s);
            if (s === "disconnected") this.emit("ended");
        });
        transport.on("peerMuted", (m) => this.emit("peerMuted", m));
        transport.on("statsChanged", (s) => this.emit("stats", s));
    }
}
