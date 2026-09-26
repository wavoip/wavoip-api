import type { ConnectivityIssue, IceDiagnostics, IceSnapshot } from "@/domain/call/ice";
import type { MediaPlan } from "@/domain/call/mediaPlan";
import { CallPolicy } from "@/domain/call/policy";
import { type CallStats, type ServerCallStats, Stats } from "@/domain/call/stats";
import { Status } from "@/domain/call/status";
import type { CallDirection, CallStatus, CallType, Peer, TransportStatus } from "@/domain/call/types";
import { Result } from "@/domain/shared/Result";
import type { AcceptFailure, CallFailureCode, CommandFailure, WavoipError } from "@/domain/shared/errors";
import { type ITransport, isRTCTransport } from "@/modules/media/ITransport";
import { EventEmitter, type Subscribable, type Unsubscribe } from "@/modules/shared/EventEmitter";
import type { CallSignalingPort, ServerCallEvent, SignalAck } from "@/ports/SignalingPort";

export type CallSessionEvents = {
    status: [status: CallStatus];
    ringing: [];
    acceptedElsewhere: [];
    rejected: [];
    unanswered: [];
    failed: [error: WavoipError<CallFailureCode | "UNKNOWN">];
    ended: [];
    /** O outro lado atendeu; a mídia da chamada que sai ainda está subindo. */
    answered: [];
    /** A mídia subiu e está ligada à chamada: é a hora de existir um ActiveCall. */
    activated: [];
    /** A mídia não subiu quando o outro lado atendeu; `cause` é o que a plataforma disse. */
    handoverFailed: [cause: unknown];
    /** A chamada acabou por decisão daqui e não espera mais nada do servidor. */
    closed: [];
    connectionStatus: [status: TransportStatus];
    peerMuted: [muted: boolean];
    iceDiagnostics: [diag: IceDiagnostics];
    connectivityIssue: [issue: ConnectivityIssue];
};

/**
 * O transporte nasce com a chamada, como no SIP: o INVITE já leva o transporte, e só o
 * destino se resolve na resposta. Device OFFICIAL fala WebRTC; UNOFFICIAL fala relay, que
 * descobre host e porta quando a chamada é aceita.
 */
export interface TransportFactory {
    /** `null` quando esta plataforma não carrega chamada desse tipo. */
    forCall(type: CallType): ITransport | null;
    forOffer(plan: MediaPlan, deviceToken: string): ITransport;
}

export type CallSessionDeps = {
    signaling: CallSignalingPort;
    transports: TransportFactory;
    setLocalMuted: (muted: boolean) => void;
};

export type CallSessionInit = {
    id: string;
    peer: Peer;
    type: CallType;
    direction: CallDirection;
    deviceToken: string;
    status: CallStatus;
    transport: ITransport;
};

export type StartCallParams = { to: string; type: CallType; deviceToken: string };

/**
 * Dona de uma chamada, do primeiro toque ao fim: o estado, a mídia e o que o servidor
 * responde. Cada método lê de cima a baixo o que acontece naquele comando, e as views
 * públicas (`IncomingCall`, `OutgoingCall`, `ActiveCall`) só leem daqui e chamam estes métodos.
 */
export class CallSession implements Subscribable<CallSessionEvents> {
    readonly id: string;
    readonly type: CallType;
    readonly direction: CallDirection;
    readonly peer: Peer;
    readonly deviceToken: string;
    status: CallStatus;

    private readonly events = new EventEmitter<CallSessionEvents>();
    private readonly transport: ITransport;
    private wired = false;
    private stopped = false;
    // Quem terminou a chamada foi quem chama a biblioteca: o eco do servidor não vira
    // evento, porque o desfecho já foi na resposta do método (v3).
    private finishedHere = false;
    private serverStats: CallStats | null = null;
    private transportStats: CallStats | null = null;

    constructor(
        private readonly deps: CallSessionDeps,
        init: CallSessionInit,
    ) {
        this.id = init.id;
        this.type = init.type;
        this.direction = init.direction;
        this.peer = init.peer;
        this.deviceToken = init.deviceToken;
        this.status = init.status;
        this.transport = init.transport;
        this.watchIce();
    }

    /**
     * O que o transporte já sabe de ICE, para quem chega depois da coleta de candidatos.
     */
    get iceSnapshot(): IceSnapshot {
        if (!isRTCTransport(this.transport)) return { diagnostics: null, issues: [] };
        return { diagnostics: this.transport.lastDiagnostics, issues: [...this.transport.emittedConnectivityIssues] };
    }

    /**
     * O diagnóstico de ICE sai desde o construtor, e não a partir do `activate()`: a chamada
     * que não conecta nunca ativa, e era justamente nela que o diagnóstico não chegava.
     */
    private watchIce(): void {
        if (!isRTCTransport(this.transport)) return;
        this.transport.on("iceDiagnostics", (diag) => this.events.emit("iceDiagnostics", diag));
        this.transport.on("connectivityIssue", (issue) => this.events.emit("connectivityIssue", issue));
    }

    /**
     * Disca. O transporte é montado antes do `call.start`, porque a chamada OFFICIAL
     * precisa mandar o SDP junto. A sessão só existe se o servidor aceitar; se não, o
     * transporte é liberado e ninguém fica com o microfone aberto.
     */
    static async Start(deps: CallSessionDeps, params: StartCallParams): Promise<Result<CallSession, AcceptFailure>> {
        const transport = deps.transports.forCall(params.type);
        // A plataforma diz na hora de abrir que não faz esse tipo, e não no meio da ligação:
        // um runtime sem WebRTC não faz OFFICIAL, um sem socket binário não faz UNOFFICIAL.
        if (!transport) return Result.fail("CALL_TYPE_UNSUPPORTED", { details: { type: params.type } });

        let plan: MediaPlan = { type: "none" };
        if (isRTCTransport(transport)) {
            try {
                plan = { type: "webRTC", sdp: await transport.createOffer() };
            } catch (e) {
                await transport.stop().catch(() => {});
                return Result.fail("MEDIA_NEGOTIATION_FAILED", { cause: e });
            }
        }

        const ack = await deps.signaling.startCall(params.to, plan, CallPolicy.ackTimeoutMs);
        if (ack.kind !== "ok") {
            await transport.stop().catch(() => {});
            return ackFailure(ack);
        }

        // O tipo da chamada vem do device (`device:init`), e não da resposta do `call.start`,
        // que já devolveu OFFICIAL para device não oficial.
        return Result.ok(
            new CallSession(deps, {
                id: ack.value.id,
                peer: ack.value.peer,
                type: params.type,
                direction: "OUTGOING",
                deviceToken: params.deviceToken,
                status: "RINGING",
                transport,
            }),
        );
    }

    on<T extends keyof CallSessionEvents>(event: T, listener: (...args: CallSessionEvents[T]) => void): Unsubscribe {
        return this.events.on(event, listener);
    }

    get connectionStatus(): TransportStatus {
        return this.transport.status;
    }

    get peerMuted(): boolean {
        return this.transport.peerMuted;
    }

    get media(): ITransport {
        return this.transport;
    }

    /** Atende a oferta recebida: o transporte já sabe com quem falar desde a criação. */
    async accept(): Promise<Result<void, AcceptFailure>> {
        let answer: MediaPlan;
        try {
            answer = await this.transport.accept();
        } catch (err) {
            // Sem isto o microfone fica aberto depois de um aceite que falhou.
            await this.stopMedia();
            return Result.fail("MEDIA_NEGOTIATION_FAILED", { cause: err });
        }

        // Só há chamada ativa depois de o servidor confirmar: sem o ack, a biblioteca
        // contaria uma chamada em curso enquanto o outro lado ainda toca.
        const ack = await this.deps.signaling.accept(this.id, answer, CallPolicy.ackTimeoutMs);
        if (ack.kind !== "ok") {
            await this.stopMedia();
            return ackFailure(ack);
        }

        this.status = Status.transition(this.status, "accept") ?? this.status;
        this.activate();
        return Result.ok();
    }

    /** A oferta só está recusada quando o servidor confirma; até lá, ela continua tocando. */
    async reject(): Promise<Result<void, CommandFailure>> {
        const ack = await this.deps.signaling.reject(this.id, CallPolicy.ackTimeoutMs);
        if (ack.kind !== "ok") return ackFailure(ack);
        this.status = Status.transition(this.status, "reject") ?? this.status;
        this.finishedHere = true;
        // O servidor pode ou não ecoar `call:rejected`; sem isto, uma oferta recusada
        // ficaria no roteamento para sempre se a resposta nunca chegar.
        this.events.emit("closed");
        return Result.ok();
    }

    /**
     * A mídia é liberada em todo desfecho **menos no que a chamada continua viva**
     * (`CALL_ALREADY_ANSWERED`): derrubar o transporte ali deixava uma chamada conectada
     * muda.
     *
     * `ACK_TIMEOUT` é o "não sabemos" honesto: o socket.io descarta o pacote em buffer
     * quando o teto vence, então o servidor pode nunca ter visto o cancelamento e o outro
     * lado pode estar tocando ainda. A mídia fica justamente porque a chamada ainda pode
     * ser atendida.
     */
    async cancel(): Promise<Result<void, CommandFailure>> {
        if (this.stopped) return Result.ok();
        const ack = await this.deps.signaling.cancel(this.id, CallPolicy.ackTimeoutMs);
        if (ack.kind !== "ok") {
            if (ack.kind === "refused" && ack.code !== CallPolicy.alreadyAnswered && !this.wired) {
                await this.stopMedia();
            }
            return ackFailure(ack);
        }
        // O servidor já recusa cancelar uma chamada ACTIVE; uma transição local que não se
        // aplica quer dizer que os dois discordam, e a mídia não cai com base num ack que
        // não dá para honrar.
        const cancelled = Status.transition(this.status, "cancel");
        if (!cancelled) return Result.fail(CallPolicy.alreadyAnswered);
        this.status = cancelled;
        this.finishedHere = true;
        if (!this.wired) await this.stopMedia();
        return Result.ok();
    }

    /**
     * A mídia só cai quando o servidor confirma o fim. Derrubá-la antes deixaria o
     * integrador anunciando chamada encerrada enquanto o outro lado continua falando.
     */
    async end(): Promise<Result<void, CommandFailure>> {
        if (this.stopped) return Result.ok();
        const ack = await this.deps.signaling.end(this.id, CallPolicy.ackTimeoutMs);
        if (ack.kind !== "ok") return ackFailure(ack);
        this.finishedHere = true;
        await this.stopMedia();
        return Result.ok();
    }

    /**
     * O outro lado precisa saber do mute — é assim que ele recebe `call:peer:muted` —, e o
     * microfone só corta depois da confirmação, para a interface não mostrar mudo enquanto
     * o áudio ainda sai.
     */
    async mute(muted: boolean): Promise<Result<void, CommandFailure>> {
        const ack = await this.deps.signaling.mute(this.id, muted, CallPolicy.ackTimeoutMs);
        if (ack.kind !== "ok") return ackFailure(ack);
        this.deps.setLocalMuted(muted);
        return Result.ok();
    }

    async getStats(): Promise<CallStats> {
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
                if (!this.finishedHere) this.events.emit("rejected");
                this.events.emit("status", this.status);
                void this.stopMedia();
                return;
            case "unanswered":
                this.events.emit("unanswered");
                this.events.emit("status", this.status);
                void this.stopMedia();
                return;
            case "failed":
                this.events.emit("failed", event.error);
                this.events.emit("status", this.status);
                void this.stopMedia();
                return;
            case "ended":
                // `status` antes de `ended`: as views se desmontam no `ended`, e um status
                // anunciado depois não chegaria a ninguém.
                this.events.emit("status", this.status);
                if (!this.finishedHere) this.events.emit("ended");
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
        if (this.type !== "UNOFFICIAL") return;
        this.serverStats = Stats.fromServer(stats);
    }

    private currentStats(): CallStats {
        if (this.type === "OFFICIAL") return this.transportStats ?? Stats.empty();
        return Stats.mergeUnofficial(this.serverStats, this.transportStats);
    }

    /** O outro lado atendeu a chamada que saiu: a resposta dele completa o transporte. */
    private async handleAnswered(plan: MediaPlan): Promise<void> {
        this.events.emit("status", this.status);
        this.events.emit("answered");
        try {
            await withTimeout(this.transport.connect(plan), CallPolicy.mediaHandoverTimeoutMs);
        } catch (cause) {
            // A causa viaja junto: sem ela o integrador recebe um `MEDIA_NEGOTIATION_FAILED`
            // mudo, e a diferença entre "o relay recusou" e "o plano veio errado" se perde.
            await this.stopMedia();
            this.events.emit("handoverFailed", cause);
            return;
        }
        this.activate();
    }

    private activate(): void {
        if (this.wired) return;
        this.wired = true;

        this.transport.on("statusChanged", (status) => this.events.emit("connectionStatus", status));
        this.transport.on("peerMuted", (muted) => this.events.emit("peerMuted", muted));

        this.events.emit("activated");
    }

    private async stopMedia(): Promise<void> {
        if (this.stopped) return;
        this.stopped = true;
        await this.transport.stop().catch(() => {});
    }
}

/** O ack que não veio é ACK_TIMEOUT; o recusado já chega traduzido pelo adaptador. */
function ackFailure(ack: Exclude<SignalAck<unknown>, { kind: "ok" }>): Result<never, CommandFailure> {
    if (ack.kind === "timeout") return Result.fail("ACK_TIMEOUT");
    return Result.fail(ack.code, { cause: ack.cause });
}

/** O teto vira exceção, e a exceção vira a causa que o integrador lê. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`A mídia não subiu em ${ms}ms`)), ms);
        work.then(resolve, reject).finally(() => clearTimeout(timer));
    });
}
