import { type CallStats, type ServerCallStats, makeEmptyCallStats } from "@/modules/call/Stats";
import type { CallFailReason } from "@/modules/device/CallFailReason";
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
    failed: [error: CallFailReason];
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
    // Só existe para alimentar o evento `stats`, que está depreciado; `getStats()` não lê
    // daqui.
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

    // Não emite `status`: isso é dos handlers de evento do servidor no CallRouter, e emitir
    // aqui também dobraria o evento.
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

    applyServerStats(stats: ServerCallStats): void {
        this.emit("serverStats", stats);
        if (this.type !== "UNOFFICIAL") return;
        this.lastServerProjection = toCallStats(stats);
        this.lastStats = this.mergeUnofficialStats();
        this.emit("stats", this.lastStats);
    }

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

    /**
     * Chamada OFFICIAL usa só as stats do WebRTC. Na UNOFFICIAL nenhum dos lados tem o
     * quadro inteiro: RTT, perda e totais vêm do `call:stats` do servidor, e bitrate,
     * nível de áudio, jitter e latência de saída só o cliente mede.
     */
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
     * Repassa os diagnósticos de ICE que o transporte juntou antes de ser ligado, para
     * quem escuta depois não perdê-los.
     */
    wireTransport(transport: ITransport): void {
        this.transport = transport;

        // Queda de transporte não encerra a chamada: uma reconexão do WS ou um ICE
        // desconectado por instantes é passageiro. Quem encerra são só os eventos terminais
        // `call:*` da sinalização (B3).
        transport.on("statusChanged", (s) => this.emit("connectionStatus", s));
        transport.on("peerMuted", (m) => this.emit("peerMuted", m));

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
    // Alguém desistiu antes do atendimento, nós ou o outro lado. Distinto de "ENDED", que
    // é desligar depois de atender.
    | "CANCELLED"
    | "ENDED"
    | "REJECTED"
    | "FAILED"
    | "DISCONNECTED";

const CALL_STATUSES: readonly CallStatus[] = [
    "RINGING",
    "CALLING",
    "NOT_ANSWERED",
    "ACTIVE",
    "CANCELLED",
    "ENDED",
    "REJECTED",
    "FAILED",
    "DISCONNECTED",
];

/**
 * O servidor tem um vocabulário maior que esta união: sem o estreitamento, um valor
 * desconhecido chegaria ao consumidor tipado como algo que ele não é, e todo `switch`
 * exaustivo do lado de lá cairia no vazio.
 */
export function toCallStatus(status: string | undefined): CallStatus {
    return CALL_STATUSES.find((known) => known === status) ?? "ENDED";
}

type TransitionName = "accept" | "reject" | "cancel" | "end" | "timeout" | "fail";

const TRANSITIONS: Record<TransitionName, { allow: (s: CallStatus) => boolean; to: CallStatus }> = {
    accept:  { allow: (s) => s === "RINGING" || s === "CALLING", to: "ACTIVE" },
    reject:  { allow: (s) => s === "ACTIVE", to: "REJECTED" },
    cancel:  { allow: (s) => s !== "ACTIVE", to: "CANCELLED" },
    end:     { allow: (s) => s === "ACTIVE", to: "ENDED" },
    timeout: { allow: (s) => s === "RINGING" || s === "CALLING", to: "NOT_ANSWERED" },
    fail:    { allow: (s) => s === "ACTIVE", to: "FAILED" },
};

export type CallType = "OFFICIAL" | "UNOFFICIAL";

/**
 * RTT da perna do cliente (device ↔ servidor), o mesmo que o indicador de ping da barra
 * de status mostra. O da perna do WhatsApp continua no `serverStats`.
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
