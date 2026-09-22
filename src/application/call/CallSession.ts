import type { CallFailReason } from "@/domain/call/failReason";
import type { ConnectivityIssue, IceDiagnostics } from "@/domain/call/ice";
import { type CallStats, type ServerCallStats, Stats } from "@/domain/call/stats";
import { CallPolicy } from "@/domain/call/policy";
import { Status } from "@/domain/call/status";
import type { CallDirection, CallStatus, CallType, MediaPlan, Peer, TransportStatus } from "@/domain/call/types";
import { type IRTCTransport, type ITransport, isRTCTransport } from "@/modules/media/ITransport";
import { EventEmitter } from "@/modules/shared/EventEmitter";
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

export type DialParams = { to: string; type: CallType; deviceToken: string };

export type CallSessionInit = {
    id: string;
    type: CallType;
    direction: CallDirection;
    peer: Peer;
    deviceToken: string;
    status: CallStatus;
    remotePlan?: MediaPlan;
    /** A oferta WebRTC montada antes do `call.start`, que vira a mídia desta chamada. */
    preparedMedia?: IRTCTransport;
};

/**
 * Dona de uma chamada, do primeiro toque ao fim: o estado, a mídia e o que o servidor
 * responde. Cada método lê de cima a baixo o que acontece naquele comando, e as views
 * públicas (`Offer`, `CallOutgoing`, `CallActive`) só leem daqui e chamam estes métodos.
 */
export class CallSession extends EventEmitter<CallSessionEvents> {
    readonly id: string;
    readonly type: CallType;
    readonly direction: CallDirection;
    readonly peer: Peer;
    readonly deviceToken: string;
    status: CallStatus;

    private readonly remotePlan?: MediaPlan;
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
        super();
        this.id = init.id;
        this.type = init.type;
        this.direction = init.direction;
        this.peer = init.peer;
        this.deviceToken = init.deviceToken;
        this.status = init.status;
        this.remotePlan = init.remotePlan;
        this.transport = init.preparedMedia ?? null;
    }

    /**
     * Disca: a chamada OFFICIAL monta a oferta WebRTC antes de pedir o `call.start`, porque
     * o servidor precisa do SDP para chamar. Se qualquer um dos dois passos falhar, a mídia
     * já montada é liberada e ninguém fica com o microfone aberto.
     */
    static async dial(
        deps: CallSessionDeps,
        params: DialParams,
    ): Promise<{ session: CallSession; err?: undefined } | { session?: undefined; err: string }> {
        let plan: MediaPlan = { type: "none" };
        let prepared: IRTCTransport | undefined;

        if (params.type === "OFFICIAL") {
            prepared = deps.transports.offerer();
            try {
                plan = { type: "webRTC", sdp: await prepared.createOffer() };
            } catch (e) {
                await prepared.stop().catch(() => {});
                return { err: e instanceof Error ? e.message : "Failed to create WebRTC offer" };
            }
        }

        const ack = await deps.signaling.startCall(params.to, plan, CallPolicy.ackTimeoutMs);
        if (ack.kind !== "ok") {
            await prepared?.stop().catch(() => {});
            return { err: ack.kind === "timeout" ? "ACK_TIMEOUT" : ack.code };
        }

        // O tipo vem do device (`device:init`), e não da resposta do `call.start`, que já
        // devolveu OFFICIAL para device não oficial.
        const session = new CallSession(deps, {
            id: ack.value.id,
            type: params.type,
            direction: "OUTGOING",
            peer: ack.value.peer,
            deviceToken: params.deviceToken,
            status: "RINGING",
            preparedMedia: prepared,
        });
        return { session };
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
                this.emit("ringing");
                this.emit("status", this.status);
                return;
            case "accepted":
                this.emit("acceptedElsewhere");
                this.emit("status", this.status);
                return;
            case "answered":
                void this.handleAnswered(event.plan);
                return;
            case "rejected":
                this.emit("rejected");
                this.emit("status", this.status);
                void this.stopMedia();
                return;
            case "unanswered":
                this.emit("unanswered");
                this.emit("status", this.status);
                void this.stopMedia();
                return;
            case "failed":
                this.emit("failed", event.reason);
                this.emit("status", this.status);
                void this.stopMedia();
                return;
            case "ended":
                // `status` antes de `ended`: as views se desmontam no `ended`, e um status
                // anunciado depois não chegaria a ninguém.
                this.emit("status", this.status);
                this.emit("ended");
                void this.stopMedia();
                return;
            case "disconnected":
            case "connected":
                this.emit("status", this.status);
                return;
            case "stats":
                this.absorbServerStats(event.stats);
                return;
            case "peerMuted":
                this.emit("peerMuted", event.muted);
                return;
        }
    }

    // Na chamada UNOFFICIAL nenhum dos lados tem o quadro inteiro, e o `call:stats` do
    // servidor entra na junção.
    private absorbServerStats(stats: ServerCallStats): void {
        this.emit("serverStats", stats);
        if (this.type !== "UNOFFICIAL") return;
        this.serverStats = Stats.fromServer(stats);
        this.emit("stats", this.currentStats());
    }

    private currentStats(): CallStats {
        if (this.type === "OFFICIAL") return this.transportStats ?? Stats.empty();
        return Stats.mergeUnofficial(this.serverStats, this.transportStats);
    }

    /** O outro lado atendeu: a oferta pré-montada vira a mídia da chamada, ou dá lugar a outra. */
    private async handleAnswered(plan: MediaPlan): Promise<void> {
        this.emit("status", this.status);
        try {
            if (this.transport && plan.type === "webRTC") await this.resumePreparedOffer(plan.sdp);
            else await this.openMediaFor(plan);
        } catch {
            await this.stopMedia();
            this.emit("handoverFailed");
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

        transport.on("statusChanged", (status) => this.emit("connectionStatus", status));
        transport.on("peerMuted", (muted) => this.emit("peerMuted", muted));
        transport.on("statsChanged", (stats) => {
            this.transportStats = stats;
            this.emit("stats", this.currentStats());
        });
        this.wireDiagnostics(transport);

        this.emit("activated");
    }

    private wireDiagnostics(transport: ITransport): void {
        if (!isRTCTransport(transport)) return;
        transport.on("iceDiagnostics", (diag) => {
            this.lastDiagnostics = diag;
            this.emit("iceDiagnostics", diag);
        });
        transport.on("connectivityIssue", (issue) => {
            this.issues.push(issue);
            this.emit("connectivityIssue", issue);
        });

        if (transport.lastDiagnostics) this.emit("iceDiagnostics", transport.lastDiagnostics);
        for (const issue of transport.emittedConnectivityIssues) this.emit("connectivityIssue", issue);
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
