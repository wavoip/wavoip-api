import { type CallStats, type ServerCallStats, makeEmptyCallStats } from "@/modules/call/Stats";
import type { MediaPlan } from "@/modules/device/WebSocket";
import type { ConnectivityIssue, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import { type ITransport, type TransportStatus, isRTCTransport } from "@/modules/media/ITransport";
import { warnDeprecated } from "@/modules/shared/deprecation";
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
    private lastServerProjection: CallStats | null = null;
    private lastTransportStats: CallStats | null = null;
    // Most recent CallStats snapshot — populated by the deprecated 200ms tick
    // (transport.statsChanged) and by applyServerStats. The pull API `getStats()`
    // bypasses this cache and triggers a fresh transport-side refresh; this
    // field exists only to back the deprecated `stats` event.
    private lastStats: CallStats = makeEmptyCallStats();
    private transport: ITransport | null = null;

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
     * Apply a server-pushed `call:stats` payload. Called by CallRouter. Emits
     * `serverStats` for retro-compat and — for UNOFFICIAL calls only — caches
     * the server projection so `wireTransport`'s next transport-stats merge
     * can produce the combined `stats` snapshot. Server-only RTT/loss/totals
     * merge with client-side bitrate/level/jitter/output-latency from the WS
     * transport (no other code path can measure those).
     */
    applyServerStats(stats: ServerCallStats): void {
        this.emit("serverStats", stats);
        if (this.type !== "UNOFFICIAL") return;
        this.lastServerProjection = toCallStats(stats);
        this.lastStats = this.mergeUnofficialStats();
        this.emit("stats", this.lastStats);
    }

    /**
     * Pull-based stats accessor — the supported API going forward. Triggers a
     * fresh transport-side `getStats()` (WebRTC: `pc.getStats()`; WS: recompute
     * bitrate/level/latency from current counters) and returns the resulting
     * snapshot.
     *
     * For UNOFFICIAL calls the transport's client-side fields are merged with
     * the most recent server-pushed projection (RTT, loss, totals from the
     * `call:stats` socket event), since neither side alone has the full picture.
     *
     * Before any transport is wired, returns an empty snapshot. The legacy
     * `on("stats", cb)` event remains supported but is deprecated.
     */
    async getStats(): Promise<CallStats> {
        if (!this.transport) return makeEmptyCallStats();
        const transportStats = await this.transport.getStats();
        if (this.type === "OFFICIAL") {
            this.lastStats = transportStats;
            return transportStats;
        }
        this.lastTransportStats = transportStats;
        this.lastStats = this.mergeUnofficialStats();
        return this.lastStats;
    }

    override on<K extends keyof CallEvents>(event: K, listener: (...args: CallEvents[K]) => void): Unsubscribe {
        if (event === "stats") {
            warnDeprecated("Call.stats event", 'use `call.getStats()` instead.');
        }
        if (event === "serverStats") {
            warnDeprecated("Call.serverStats event", 'use `call.getStats()` instead.');
        }
        return super.on(event, listener);
    }

    private mergeUnofficialStats(): CallStats {
        const base = this.lastServerProjection ?? makeEmptyCallStats();
        const t = this.lastTransportStats;
        if (!t) return base;
        return {
            rtt: base.rtt,
            tx: {
                ...base.tx,
                bitrate_kbps: t.tx.bitrate_kbps,
                audio_level: t.tx.audio_level,
            },
            rx: {
                ...base.rx,
                bitrate_kbps: t.rx.bitrate_kbps,
                audio_level: t.rx.audio_level,
                jitter_ms: t.rx.jitter_ms,
            },
            audio_context: { ...t.audio_context },
        };
    }

    /**
     * Subscribe to transport events. Called after construction once a
     * WebRTC/WebSocket transport is ready. Replays any ICE diagnostics the
     * transport gathered before being wired so late listeners catch up.
     */
    wireTransport(transport: ITransport): void {
        this.transport = transport;

        // Forward connection status without inferring call termination from it.
        // Transient transport drops (WS reconnect, brief WebRTC ICE disconnect) used
        // to end the call here, which racy reconnects could fire. Call termination
        // is now driven exclusively by the signaling `call:*` terminal events (B3).
        transport.on("statusChanged", (s) => this.emit("connectionStatus", s));
        transport.on("peerMuted", (m) => this.emit("peerMuted", m));

        // OFFICIAL calls use WebRTC peer-measured stats as source of truth.
        // UNOFFICIAL (relay) calls take RTT/loss/totals from server `call:stats` but
        // merge client-side fields (bitrate, audio level, jitter, output latency) from
        // the WebSocket transport — only the client can measure those.
        if (this.type === "OFFICIAL") {
            transport.on("statsChanged", (s) => {
                this.lastStats = s;
                this.emit("stats", s);
            });
        } else {
            transport.on("statsChanged", (s) => {
                this.lastTransportStats = s;
                this.lastStats = this.mergeUnofficialStats();
                this.emit("stats", this.lastStats);
            });
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
        tx: { ...s.tx, bitrate_kbps: 0, audio_level: 0 },
        rx: { ...s.rx, bitrate_kbps: 0, audio_level: 0, jitter_ms: 0 },
        audio_context: { output_latency_ms: 0 },
    };
}

export type Peer = {
    phone: string;
    displayName: string | null;
    profilePicture: string | null;
};

export type CallDirection = "INCOMING" | "OUTGOING";
