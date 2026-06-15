import type { CallStats, ServerCallStats } from "@/modules/call/Stats";
import type { DeviceSocket, MediaPlan } from "@/modules/device/WebSocket";
import type { ITransport, TransportStatus } from "@/modules/media/ITransport";
import { EventEmitter } from "@/modules/shared/EventEmitter";

export type CallEvents = {
    status: [status: CallStatus];
    ringing: [];
    ended: [];
    accepted: [];
    answered: [mediaPlan: MediaPlan];
    rejected: [];
    unanswered: [];
    failed: [error: string];
    connectionStatus: [status: TransportStatus];
    peerMuted: [muted: boolean];
    stats: [stats: CallStats];
    serverStats: [stats: ServerCallStats];
};

export class Call extends EventEmitter<CallEvents> {
    constructor(
        public readonly id: string,
        public readonly type: CallType,
        public readonly direction: CallDirection,
        public readonly peer: Peer,
        public readonly deviceToken: string,
        public status: CallStatus,
    ) {
        super();
    }

    accept(): boolean {
        if (!["RINGING", "CALLING"].includes(this.status)) return false;
        this.status = "ACTIVE";
        return true;
    }

    reject(): boolean {
        if (this.status !== "ACTIVE") return false;
        this.status = "REJECTED";
        return true;
    }

    cancel(): boolean {
        if (this.status === "ACTIVE") return false;
        this.status = "ENDED";
        return true;
    }

    end(): boolean {
        if (this.status !== "ACTIVE") return false;
        this.status = "ENDED";
        return true;
    }

    timeout() {
        if (!["RINGING", "CALLING"].includes(this.status)) return false;
        this.status = "NOT_ANSWERED";
        return true;
    }

    fail() {
        if (!["ACTIVE"].includes(this.status)) return false;
        this.status = "FAILED";
        return true;
    }

    /**
     * Subscribe to socket events scoped to this call.id. Aggregates raw
     * `call:*` server events into the typed Call event stream.
     */
    wireSocket(socket: DeviceSocket): void {
        socket.on("call:ringing", (id) => {
            if (id !== this.id) return;
            this.emit("ringing");
            this.emit("status", "RINGING");
        });
        socket.on("call:ended", (id) => {
            if (id !== this.id) return;
            this.emit("ended");
            this.emit("status", "ENDED");
        });
        socket.on("call:accepted", (id) => {
            if (id !== this.id) return;
            this.emit("accepted");
            this.emit("status", "ACTIVE");
        });
        socket.on("call:answered", (id, mediaPlan) => {
            if (id !== this.id) return;
            this.emit("answered", mediaPlan);
            this.emit("status", "ACTIVE");
        });
        socket.on("call:unanswered", (id) => {
            if (id !== this.id) return;
            this.emit("unanswered");
            this.emit("status", "NOT_ANSWERED");
        });
        socket.on("call:rejected", (id) => {
            if (id !== this.id) return;
            this.emit("rejected");
            this.emit("status", "REJECTED");
        });
        socket.on("call:failed", (id, err) => {
            if (id !== this.id) return;
            this.emit("failed", err);
            this.emit("status", "FAILED");
        });
        socket.on("call:stats", (id, stats) => {
            if (id !== this.id) return;
            this.emit("serverStats", stats);
        });
    }

    /**
     * Subscribe to transport events. Called after construction once a
     * WebRTC/WebSocket transport is ready.
     */
    wireTransport(transport: ITransport): void {
        transport.on("statusChanged", (s) => {
            this.emit("connectionStatus", s);
            if (s === "disconnected") this.emit("ended");
        });
        transport.on("peerMuted", (m) => this.emit("peerMuted", m));
        transport.on("statsChanged", (s) => this.emit("stats", s));
    }

    static CreateOffer(id: string, type: CallType, peer: Peer, deviceToken: string) {
        return new Call(id, type, "INCOMING", peer, deviceToken, "CALLING");
    }
}

export type CallStatus =
    | "RINGING"
    | "CALLING"
    | "NOT_ANSWERED"
    | "ACTIVE"
    | "ENDED"
    | "REJECTED"
    | "FAILED"
    | "DISCONNECTED";

export type CallType = "OFFICIAL" | "UNOFFICIAL";

export type Peer = {
    phone: string;
    displayName: string | null;
    profilePicture: string | null;
};

export type CallDirection = "INCOMING" | "OUTGOING";
