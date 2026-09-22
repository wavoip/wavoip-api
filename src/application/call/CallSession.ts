import type { CallFailReason } from "@/domain/call/failReason";
import type { ConnectivityIssue, IceDiagnostics } from "@/domain/call/ice";
import { type CallStats, type ServerCallStats, Stats } from "@/domain/call/stats";
import { CallPolicy } from "@/domain/call/policy";
import { Status } from "@/domain/call/status";
import type { CallDirection, CallStatus, CallType, MediaPlan, Peer, TransportStatus } from "@/domain/call/types";
import { type IRTCTransport, type ITransport, isRTCTransport } from "@/modules/media/ITransport";
import { EventEmitter, type Subscribable, type Unsubscribe } from "@/modules/shared/EventEmitter";
import type { CallSignalingPort, ServerCallEvent } from "@/ports/SignalingPort";

export type CallSessionEvents = {
    status: [status: CallStatus];
    ringing: [];
    acceptedElsewhere: [];
    rejected: [];
    unanswered: [];
    failed: [reason: CallFailReason];
    ended: [];
    /** A mídia subiu e está ligada à chamada: é a hora de existir um CallActive. */
    activated: [];
    /** A passagem da oferta pré-montada para a chamada ativa falhou. */
    handoverFailed: [];
    connectionStatus: [status: TransportStatus];
    peerMuted: [muted: boolean];
    stats: [stats: CallStats];
    serverStats: [stats: ServerCallStats];
    iceDiagnostics: [diag: IceDiagnostics];
    connectivityIssue: [issue: ConnectivityIssue];
};

/** Cria o transporte que o plano de mídia pede. A mídia em si é do PR de mídia. */
export interface TransportFactory {
    offerer(): IRTCTransport;
    forPlan(plan: MediaPlan, deviceToken: string): ITransport;
}

export type CallSessionDeps = {
    signaling: CallSignalingPort;
    transports: TransportFactory;
    setLocalMuted: (muted: boolean) => void;
};

export type CallSessionInit = {
    /** Só a chamada que entra já nasce com id e contato; a que sai os recebe no `dial`. */
    id?: string;
    peer?: Peer;
    type: CallType;
    direction: CallDirection;
    deviceToken: string;
    status: CallStatus;
    /** O plano de mídia que veio na oferta recebida. */
    remotePlan?: MediaPlan;
};

/**
 * Dona de uma chamada, do primeiro toque ao fim: o estado, a mídia e o que o servidor
 * responde. Cada método lê de cima a baixo o que acontece naquele comando, e as views
 * públicas (`Offer`, `CallOutgoing`, `CallActive`) só leem daqui e chamam estes métodos.
 */
export class CallSession implements Subscribable<CallSessionEvents> {
    readonly type: CallType;
    readonly direction: CallDirection;
    readonly deviceToken: string;
    status: CallStatus;

    private readonly events = new EventEmitter<CallSessionEvents>();
    private readonly remotePlan?: MediaPlan;
    private callId: string | null;
    private _peer: Peer | null;
    private transport: ITransport | null = null;
    private wired = false;
    private stopped = false;
    private serverStats: CallStats | null = null;
    private transportStats: CallStats | null = null;
    private lastDiagnostics: IceDiagnostics | null = null;
    private readonly issues: ConnectivityIssue[] = [];

    constructor(
        private readonly deps: CallSessionDeps,
        init: CallSessionInit,
    ) {
        this.callId = init.id ?? null;
        this.type = init.type;
        this.direction = init.direction;
        this._peer = init.peer ?? null;
        this.deviceToken = init.deviceToken;
        this.status = init.status;
        this.remotePlan = init.remotePlan;
    }

    /** Uma chamada que ainda vai sair: sem id nem contato até o servidor responder ao `dial`. */
    static forOutgoing(deps: CallSessionDeps, params: { type: CallType; deviceToken: string }): CallSession {
        return new CallSession(deps, {
            type: params.type,
            direction: "OUTGOING",
            deviceToken: params.deviceToken,
            status: "RINGING",
        });
    }

    get id(): string {
        if (!this.callId) throw new Error("A chamada ainda não tem id: o servidor não respondeu ao dial");
        return this.callId;
    }

    get peer(): Peer {
        if (!this._peer) throw new Error("A chamada ainda não tem contato: o servidor não respondeu ao dial");
        return this._peer;
    }

    on<T extends keyof CallSessionEvents>(event: T, listener: (...args: CallSessionEvents[T]) => void): Unsubscribe {
        return this.events.on(event, listener);
    }

    /**
     * Disca: a chamada OFFICIAL monta a oferta WebRTC antes de pedir o `call.start`, porque
     * o servidor precisa do SDP para chamar. Se qualquer um dos dois passos falhar, a mídia
     * já montada é liberada e ninguém fica com o microfone aberto.
     */
    async dial(to: string): Promise<string | null> {
        const plan = await this.prepareOutgoingPlan();
        if (typeof plan === "string") return plan;

        const ack = await this.deps.signaling.startCall(to, plan, CallPolicy.ackTimeoutMs);
        if (ack.kind !== "ok") {
            await this.stopMedia();
            return ack.kind === "timeout" ? "ACK_TIMEOUT" : ack.code;
        }

        // O tipo da chamada vem do device (`device:init`), e não da resposta do `call.start`,
        // que já devolveu OFFICIAL para device não oficial.
        this.callId = ack.value.id;
        this._peer = ack.value.peer;
        return null;
    }

    /** O plano que vai no `call.start`, ou a mensagem de erro se a oferta não subir. */
    private async prepareOutgoingPlan(): Promise<MediaPlan | string> {
        if (this.type !== "OFFICIAL") return { type: "none" };

        const offerer = this.deps.transports.offerer();
        this.transport = offerer;
        try {
            return { type: "webRTC", sdp: await offerer.createOffer() };
        } catch (e) {
            await this.stopMedia();
            return e instanceof Error ? e.message : "Failed to create WebRTC offer";
        }
    }

    get connectionStatus(): TransportStatus {
        return this.transport?.status ?? "disconnected";
    }

    get peerMuted(): boolean {
        return this.transport?.peerMuted ?? false;
    }

    get media(): ITransport | null {
        return this.transport;
    }

    /** Atende a oferta recebida e devolve a chamada já ativa. */
    async accept(): Promise<void> {
        const plan = this.remotePlan;
        if (plan?.type === "webRTC") return this.acceptWebRTC(plan);
        if (plan?.type === "relay") return this.acceptRelay(plan);
        throw new Error(`Unsupported media plan type: ${plan?.type}`);
    }

    reject(): void {
        this.deps.signaling.reject(this.id);
    }

    /**
     * A mídia é liberada em todo desfecho **menos no que a chamada continua viva**
     * (`CallPolicy.alreadyAnswered`): derrubar o transporte ali deixava uma chamada conectada
     * muda.
     *
     * `ACK_TIMEOUT` é o "não sabemos" honesto: o socket.io descarta o pacote em buffer
     * quando o teto vence, então o servidor pode nunca ter visto o cancelamento e o outro
     * lado pode estar tocando ainda. A mídia fica justamente porque a chamada ainda pode
     * ser atendida.
     */
    async cancel(): Promise<string | null> {
        const ack = await this.deps.signaling.cancel(this.id, CallPolicy.ackTimeoutMs);
        if (ack.kind === "timeout") return "ACK_TIMEOUT";
        if (ack.kind === "refused") {
            if (ack.code !== CallPolicy.alreadyAnswered) await this.releasePreparedMedia();
            return ack.code;
        }
        // O servidor já recusa cancelar uma chamada ACTIVE; uma transição local que não se
        // aplica quer dizer que os dois discordam, e a mídia não cai com base num ack que
        // não dá para honrar.
        const cancelled = Status.transition(this.status, "cancel");
        if (!cancelled) return CallPolicy.alreadyAnswered;
        this.status = cancelled;
        await this.releasePreparedMedia();
        return null;
    }

    async end(): Promise<void> {
        if (this.stopped) return;
        this.deps.signaling.end(this.id);
        await this.stopMedia();
    }

    /** O mute da chamada que sai avisa o servidor; o da chamada ativa é só local. */
    async mute(muted: boolean, via: "outgoing" | "active"): Promise<string | null> {
        if (via === "active") {
            this.deps.setLocalMuted(muted);
            return null;
        }
        const ack = await this.deps.signaling.mute(this.id, muted, CallPolicy.ackTimeoutMs);
        if (ack.kind === "timeout") return "ACK_TIMEOUT";
        if (ack.kind === "refused") return ack.code;
        this.deps.setLocalMuted(muted);
        return null;
    }

    async getStats(): Promise<CallStats> {
        if (!this.transport) return Stats.empty();
        this.transportStats = await this.transport.getStats();
        return this.currentStats();
    }

    handleServerEvent(event: ServerCallEvent): void {
        this.settle(event);
        this.announce(event);
    }

    // O status que o servidor anuncia vale antes de qualquer notificação: quem lê `status`
    // dentro de um listener já vê o novo.
    private settle(event: ServerCallEvent): void {
        if (event.type === "ringing") this.status = "RINGING";
        if (event.type === "accepted" || event.type === "answered" || event.type === "connected") {
            this.status = "ACTIVE";
        }
        if (event.type === "rejected") this.status = "REJECTED";
        if (event.type === "unanswered") this.status = "NOT_ANSWERED";
        if (event.type === "failed") this.status = "FAILED";
        if (event.type === "disconnected") this.status = "DISCONNECTED";
        if (event.type === "ended") this.status = event.status;
    }

    private announce(event: ServerCallEvent): void {
        switch (event.type) {
            case "ringing":
                this.events.emit("ringing");
                this.events.emit("status", this.status);
                return;
            case "accepted":
                this.events.emit("acceptedElsewhere");
                this.events.emit("status", this.status);
                return;
            case "answered":
                void this.handleAnswered(event.plan);
                return;
            case "rejected":
                this.events.emit("rejected");
                this.events.emit("status", this.status);
                void this.stopMedia();
                return;
            case "unanswered":
                this.events.emit("unanswered");
                this.events.emit("status", this.status);
                void this.stopMedia();
                return;
            case "failed":
                this.events.emit("failed", event.reason);
                this.events.emit("status", this.status);
                void this.stopMedia();
                return;
            case "ended":
                // `status` antes de `ended`: as views se desmontam no `ended`, e um status
                // anunciado depois não chegaria a ninguém.
                this.events.emit("status", this.status);
                this.events.emit("ended");
                void this.stopMedia();
                return;
            case "disconnected":
            case "connected":
                this.events.emit("status", this.status);
                return;
            case "stats":
                this.absorbServerStats(event.stats);
                return;
            case "peerMuted":
                this.events.emit("peerMuted", event.muted);
                return;
        }
    }

    // Na chamada UNOFFICIAL nenhum dos lados tem o quadro inteiro, e o `call:stats` do
    // servidor entra na junção.
    private absorbServerStats(stats: ServerCallStats): void {
        this.events.emit("serverStats", stats);
        if (this.type !== "UNOFFICIAL") return;
        this.serverStats = Stats.fromServer(stats);
        this.events.emit("stats", this.currentStats());
    }

    private currentStats(): CallStats {
        if (this.type === "OFFICIAL") return this.transportStats ?? Stats.empty();
        return Stats.mergeUnofficial(this.serverStats, this.transportStats);
    }

    /** O outro lado atendeu: a oferta pré-montada vira a mídia da chamada, ou dá lugar a outra. */
    private async handleAnswered(plan: MediaPlan): Promise<void> {
        this.events.emit("status", this.status);
        try {
            if (this.transport && plan.type === "webRTC") await this.resumePreparedOffer(plan.sdp);
            else await this.openMediaFor(plan);
        } catch {
            await this.stopMedia();
            this.events.emit("handoverFailed");
            return;
        }
        this.activate();
    }

    private async resumePreparedOffer(sdp: string): Promise<void> {
        const transport = this.transport;
        if (!transport || !isRTCTransport(transport)) throw new Error("Prepared media is not a WebRTC offer");
        await transport.setAnswer(sdp);
        await transport.start();
    }

    private async openMediaFor(plan: MediaPlan): Promise<void> {
        await this.discardPreparedMedia();
        this.transport = this.deps.transports.forPlan(plan, this.deviceToken);
        await this.transport.start();
        if (plan.type !== "webRTC") return;
        const answer = await this.localAnswer();
        this.deps.signaling.accept(this.id, { type: "webRTC", sdp: answer });
    }

    private async acceptWebRTC(plan: MediaPlan): Promise<void> {
        this.transport = this.deps.transports.forPlan(plan, this.deviceToken);
        try {
            await this.transport.start();
            const answer = await this.localAnswer();
            this.deps.signaling.accept(this.id, { type: "webRTC", sdp: answer });
        } catch (err) {
            // Sem isto o microfone fica aberto depois de um aceite que falhou.
            await this.stopMedia();
            throw err;
        }
        this.applyLocalAccept();
        this.activate();
    }

    // A chamada ativa existe antes de o relay conectar: o `connectionStatus` dela mostra a
    // conexão subindo.
    private async acceptRelay(plan: MediaPlan): Promise<void> {
        this.transport = this.deps.transports.forPlan(plan, this.deviceToken);
        this.applyLocalAccept();
        this.activate();
        this.deps.signaling.accept(this.id, { type: "none" });
        void this.transport.start();
    }

    private applyLocalAccept(): void {
        this.status = Status.transition(this.status, "accept") ?? this.status;
    }

    private async localAnswer(): Promise<string> {
        const transport = this.transport;
        if (!transport || !isRTCTransport(transport)) throw new Error("Transport cannot answer a WebRTC offer");
        const answer = await transport.answer;
        return answer.sdp as string;
    }

    /**
     * Liga a mídia à chamada. O que o transporte reportou antes disso (diagnóstico de ICE
     * da oferta) é repassado agora, para quem só passa a escutar com a chamada ativa não
     * perder.
     */
    private activate(): void {
        const transport = this.transport;
        if (!transport || this.wired) return;
        this.wired = true;

        transport.on("statusChanged", (status) => this.events.emit("connectionStatus", status));
        transport.on("peerMuted", (muted) => this.events.emit("peerMuted", muted));
        transport.on("statsChanged", (stats) => {
            this.transportStats = stats;
            this.events.emit("stats", this.currentStats());
        });
        this.wireDiagnostics(transport);

        this.events.emit("activated");
    }

    private wireDiagnostics(transport: ITransport): void {
        if (!isRTCTransport(transport)) return;
        transport.on("iceDiagnostics", (diag) => {
            this.lastDiagnostics = diag;
            this.events.emit("iceDiagnostics", diag);
        });
        transport.on("connectivityIssue", (issue) => {
            this.issues.push(issue);
            this.events.emit("connectivityIssue", issue);
        });

        if (transport.lastDiagnostics) this.events.emit("iceDiagnostics", transport.lastDiagnostics);
        for (const issue of transport.emittedConnectivityIssues) this.events.emit("connectivityIssue", issue);
    }

    /** O cancelamento só solta a mídia pré-montada; depois de ligada, quem a solta é o fim. */
    private async releasePreparedMedia(): Promise<void> {
        if (this.wired) return;
        await this.stopMedia();
    }

    private async discardPreparedMedia(): Promise<void> {
        const prepared = this.transport;
        this.transport = null;
        await prepared?.stop().catch(() => {});
    }

    private async stopMedia(): Promise<void> {
        if (this.stopped) return;
        this.stopped = true;
        await this.transport?.stop().catch(() => {});
    }
}
