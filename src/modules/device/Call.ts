import type { CallStats, ServerCallStats } from "@/modules/call/Stats";
import type { MediaPlan } from "@/modules/device/WebSocket";
import type { ConnectivityIssue, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import { type ITransport, type TransportStatus, isRTCTransport } from "@/modules/media/ITransport";
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
    // responsibility of the CallRouter's server-event handlers (no double-emit).
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

        // OFFICIAL calls use WebRTC peer-measured stats as source of truth.
        // UNOFFICIAL (relay) calls have no usable transport stats and rely on
        // server-pushed `call:stats` (routed via CallRouter).
        if (this.type === "OFFICIAL") {
            transport.on("statsChanged", (s) => this.emit("stats", s));
        }

        // ICE events come only from WebRTC transports. Narrow via the kind
        // discriminator so the WS path doesn't see a no-op replay block, and so
        // the WebRTC-only fields stop polluting the base ITransport surface.
        if (!isRTCTransport(transport)) return;
        transport.on("iceDiagnostics", (d) => this.emit("iceDiagnostics", d));
        transport.on("connectivityIssue", (i) => this.emit("connectivityIssue", i));

        if (transport.lastDiagnostics) this.emit("iceDiagnostics", transport.lastDiagnostics);
        for (const issue of transport.emittedConnectivityIssues) this.emit("connectivityIssue", issue);
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

/**
 * Project server-pushed ServerCallStats onto the consumer-facing CallStats shape.
 * Uses the client-leg RTT (device ↔ server) — the same value already shown in the
 * status-bar ping indicator. The whatsapp-leg RTT remains available via `serverStats`.
 */
export function toCallStats(s: ServerCallStats): CallStats {
    return {
        rtt: { ...s.rtt.client },
        tx: { ...s.tx },
        rx: { ...s.rx },
    };
}

export type Peer = {
    phone: string;
    displayName: string | null;
    profilePicture: string | null;
};

export type CallDirection = "INCOMING" | "OUTGOING";
