import { type TransitionName, Status } from "@/domain/call/status";
import { type CallStats, type ServerCallStats, Stats } from "@/domain/call/stats";
import type { CallDirection, CallStatus, CallType, Peer } from "@/domain/call/types";
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
    private lastStats: CallStats = Stats.empty();
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
        const next = Status.transition(this.status, name);
        if (!next) return false;
        this.status = next;
        return true;
    }

    // O status anunciado pelo servidor vale sem passar pela tabela de transições, que só
    // guarda os comandos locais. Quem chama é o CallRouter, antes de emitir.
    settle(status: CallStatus): void {
        this.status = status;
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
        this.lastServerProjection = Stats.fromServer(stats);
        this.lastStats = this.mergeUnofficialStats();
        this.emit("stats", this.lastStats);
    }

    async getStats(): Promise<CallStats> {
        if (!this.transport) return Stats.empty();
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
        return Stats.mergeUnofficial(this.lastServerProjection, this.lastTransportStats);
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

export { Status } from "@/domain/call/status";
export type { CallDirection, CallStatus, CallType, Peer } from "@/domain/call/types";
