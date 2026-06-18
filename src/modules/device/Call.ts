import type { CallStats, ServerCallStats } from "@/modules/call/Stats";
import type { DeviceSocket, MediaPlan, ServerEvents } from "@/modules/device/WebSocket";
import type { ConnectivityIssue, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import type { ITransport, TransportStatus } from "@/modules/media/ITransport";
import { EventEmitter, type Unsubscribe } from "@/modules/shared/EventEmitter";

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
    iceDiagnostics: [diag: IceDiagnostics];
    connectivityIssue: [issue: ConnectivityIssue];
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

    // Status-transition table. Each entry guards a transition by predicate on the
    // current status and declares the target. Behavior matches the historical
    // ad-hoc methods exactly — emitting `status` on transition stays the
    // responsibility of `wireSocket`'s server-event handlers (no double-emit).
    private transition(name: TransitionName): boolean {
        const def = TRANSITIONS[name];
        if (!def.allow(this.status)) return false;
        this.status = def.to;
        return true;
    }

    accept(): boolean { return this.transition("accept"); }
    reject(): boolean { return this.transition("reject"); }
    cancel(): boolean { return this.transition("cancel"); }
    end(): boolean { return this.transition("end"); }
    timeout(): boolean { return this.transition("timeout"); }
    fail(): boolean { return this.transition("fail"); }

    /**
     * Subscribe to socket events scoped to this call.id. Aggregates raw
     * `call:*` server events into the typed Call event stream. The returned
     * Unsubscribe removes every socket listener installed here; it is also
     * invoked automatically when a terminal status event arrives so abandoned
     * Calls do not leak listeners on the shared device socket (B2).
     */
    wireSocket(socket: DeviceSocket): Unsubscribe {
        const unsubs: Array<() => void> = [];
        let disposed = false;
        const disposeAll = () => {
            if (disposed) return;
            disposed = true;
            for (const u of unsubs) u();
        };
        // socket.io's typed Socket exposes a FallbackToUntypedListener that the
        // compiler can't unify with our local E generic. Cast once via `unknown` to
        // a narrowly-typed shape so the rest of bind stays fully typed.
        type SocketLike = {
            on<E extends keyof ServerEvents>(event: E, handler: ServerEvents[E]): unknown;
            off<E extends keyof ServerEvents>(event: E, handler: ServerEvents[E]): unknown;
        };
        const s = socket as unknown as SocketLike;
        const bind = <E extends keyof ServerEvents>(event: E, handler: ServerEvents[E]) => {
            s.on(event, handler);
            unsubs.push(() => s.off(event, handler));
        };

        bind("call:ringing", (id) => {
            if (id !== this.id) return;
            this.emit("ringing");
            this.emit("status", "RINGING");
        });
        bind("call:ended", (id) => {
            if (id !== this.id) return;
            this.emit("ended");
            this.emit("status", "ENDED");
            disposeAll();
        });
        bind("call:accepted", (id) => {
            if (id !== this.id) return;
            this.emit("accepted");
            this.emit("status", "ACTIVE");
        });
        bind("call:answered", (id, mediaPlan) => {
            if (id !== this.id) return;
            this.emit("answered", mediaPlan);
            this.emit("status", "ACTIVE");
        });
        bind("call:unanswered", (id) => {
            if (id !== this.id) return;
            this.emit("unanswered");
            this.emit("status", "NOT_ANSWERED");
            disposeAll();
        });
        bind("call:rejected", (id) => {
            if (id !== this.id) return;
            this.emit("rejected");
            this.emit("status", "REJECTED");
            disposeAll();
        });
        bind("call:failed", (id, err) => {
            if (id !== this.id) return;
            this.emit("failed", err);
            this.emit("status", "FAILED");
            disposeAll();
        });
        bind("call:stats", (id, stats) => {
            if (id !== this.id) return;
            this.emit("serverStats", stats);
        });
        // Relay (UNOFFICIAL) peer mute travels through the server: only WebRTC
        // transports detect mute via track events. Wiring this here covers both
        // transports uniformly (B5).
        bind("call:peer:muted", (id, muted) => {
            if (id !== this.id) return;
            this.emit("peerMuted", muted);
        });

        return disposeAll;
    }

    /**
     * Subscribe to transport events. Called after construction once a
     * WebRTC/WebSocket transport is ready. Replays any ICE diagnostics the
     * transport gathered before being wired so late listeners catch up.
     */
    wireTransport(transport: ITransport): void {
        // Forward connection status without inferring call termination from it.
        // Transient transport drops (WS reconnect, brief WebRTC ICE disconnect) used
        // to end the call here, which racy reconnects could fire. Call termination
        // is now driven exclusively by the signaling `call:*` terminal events (B3).
        transport.on("statusChanged", (s) => this.emit("connectionStatus", s));
        transport.on("peerMuted", (m) => this.emit("peerMuted", m));
        transport.on("statsChanged", (s) => this.emit("stats", s));
        transport.on("iceDiagnostics", (d) => this.emit("iceDiagnostics", d));
        transport.on("connectivityIssue", (i) => this.emit("connectivityIssue", i));

        if (transport.lastDiagnostics) this.emit("iceDiagnostics", transport.lastDiagnostics);
        if (transport.emittedConnectivityIssues) {
            for (const issue of transport.emittedConnectivityIssues) this.emit("connectivityIssue", issue);
        }
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

type TransitionName = "accept" | "reject" | "cancel" | "end" | "timeout" | "fail";

const TRANSITIONS: Record<TransitionName, { allow: (s: CallStatus) => boolean; to: CallStatus }> = {
    accept:  { allow: (s) => s === "RINGING" || s === "CALLING", to: "ACTIVE" },
    reject:  { allow: (s) => s === "ACTIVE", to: "REJECTED" },
    cancel:  { allow: (s) => s !== "ACTIVE", to: "ENDED" },
    end:     { allow: (s) => s === "ACTIVE", to: "ENDED" },
    timeout: { allow: (s) => s === "RINGING" || s === "CALLING", to: "NOT_ANSWERED" },
    fail:    { allow: (s) => s === "ACTIVE", to: "FAILED" },
};

export type CallType = "OFFICIAL" | "UNOFFICIAL";

export type Peer = {
    phone: string;
    displayName: string | null;
    profilePicture: string | null;
};

export type CallDirection = "INCOMING" | "OUTGOING";
