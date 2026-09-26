import { Deferred } from "@/domain/shared/deferred";
import {
    type ConnectivityIssue,
    DEFAULT_ICE_GATHERING_TIMEOUT_MS,
    DEFAULT_ICE_SERVERS,
    type IceCandidateKind,
    type IceConfig,
    type IceDiagnostics,
} from "@/modules/media/ICEDiagnostics";
import type { TransportStatus } from "@/modules/media/ITransport";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import type { PeerConnectionFactory, PeerConnectionLike, SessionDescription } from "@/ports/runtime/PeerConnectionPort";

const SYMMETRIC_NAT_DETECTION_WINDOW_MS = 10_000;

/** Quanto tempo sem candidato novo já conta como coleta encerrada. */
const GATHERING_QUIET_MS = 500;

/**
 * Quem chama anexa os senders com `pc.addTrack` antes do `start()`.
 *
 * Duas entradas: `createOffer()` + `setAnswer()` na chamada que sai, `start()` com a
 * oferta remota passada no construtor na chamada que entra.
 */
export type RTCConnectionEvents = {
    statusChanged: [status: TransportStatus];
    iceDiagnostics: [diag: IceDiagnostics];
    connectivityIssue: [issue: ConnectivityIssue];
};

export class RTCConnection extends EventEmitter<RTCConnectionEvents> {
    readonly kind = "webrtc" as const;
    status: TransportStatus = "disconnected";
    readonly pc: PeerConnectionLike;
    readonly answer: Promise<SessionDescription>;
    lastDiagnostics: IceDiagnostics | null = null;

    private readonly answerResolver: Deferred<SessionDescription>;
    private readonly remoteOffer?: SessionDescription;
    private started = false;
    private offerCreated = false;
    private stopped = false;

    private readonly gatheringTimeoutMs: number;
    private gatheringStartedAt = 0;
    private candidatesByType: Record<IceCandidateKind, number> = {
        host: 0,
        srflx: 0,
        prflx: 0,
        relay: 0,
    };
    private symmetricNatTimer: ReturnType<typeof setTimeout> | null = null;
    private stunReached = false;
    private negotiated = false;
    private _emittedConnectivityIssues = new Set<ConnectivityIssue>();

    get emittedConnectivityIssues(): ReadonlySet<ConnectivityIssue> {
        return this._emittedConnectivityIssues;
    }

    constructor(offer: string | undefined, iceConfig: IceConfig | undefined, createPeer: PeerConnectionFactory) {
        super();

        this.gatheringTimeoutMs = iceConfig?.gatheringTimeoutMs ?? DEFAULT_ICE_GATHERING_TIMEOUT_MS;
        const iceServers = iceConfig?.iceServers ?? DEFAULT_ICE_SERVERS;

        this.pc = createPeer({ iceServers });
        if (offer) this.remoteOffer = { type: "offer", sdp: offer };

        this.answerResolver = Deferred.of<SessionDescription>();
        this.answer = this.answerResolver.promise;

        this.pc.addEventListener("icecandidate", (event) => {
            const candidate = event.candidate;
            if (!candidate) return;
            const kind = candidate.type as IceCandidateKind | undefined;
            if (kind && kind in this.candidatesByType) this.candidatesByType[kind] += 1;
        });

        this.pc.addEventListener("iceconnectionstatechange", () => {
            if (this.pc.iceConnectionState === "failed") {
                this.emitIssue("ICE_CONNECTION_FAILED");
            }
            if (this.pc.iceConnectionState === "connected" || this.pc.iceConnectionState === "completed") {
                if (this.symmetricNatTimer) clearTimeout(this.symmetricNatTimer);
            }
        });

        this.pc.addEventListener("connectionstatechange", () => {
            if (this.pc.connectionState === "connecting") this.setStatus("connecting");
            if (this.pc.connectionState === "disconnected" || this.pc.connectionState === "closed") {
                this.setStatus("disconnected");
            }
            if (this.pc.connectionState === "connected") this.setStatus("connected");
        });
    }

    async start(): Promise<void> {
        if (this.started) return;
        this.started = true;

        if (!this.remoteOffer) return;

        await this.pc.setRemoteDescription(this.remoteOffer);
        this.negotiated = true;
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);

        await this.waitForIceGathering();

        this.answerResolver.resolve(this.pc.localDescription as SessionDescription);
    }

    async createOffer(): Promise<string> {
        if (this.offerCreated) return this.pc.localDescription?.sdp as string;
        this.offerCreated = true;

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);

        await this.waitForIceGathering();

        return this.pc.localDescription?.sdp as string;
    }

    async setAnswer(sdp: string): Promise<void> {
        await this.pc.setRemoteDescription({ type: "answer", sdp });
        this.negotiated = true;
        this.watchForSymmetricNat();
    }

    async stop(): Promise<void> {
        if (this.stopped) return;
        this.stopped = true;

        if (this.symmetricNatTimer) clearTimeout(this.symmetricNatTimer);
        this.pc.close();
    }

    private async waitForIceGathering(): Promise<void> {
        this.gatheringStartedAt = Date.now();

        const timedOut = await this.raceGatheringWithTimeout();

        const duration = Date.now() - this.gatheringStartedAt;
        const stunReached = this.candidatesByType.srflx > 0;
        const turnReached = this.candidatesByType.relay > 0;

        const diag: IceDiagnostics = {
            gatheringDurationMs: duration,
            gatheringTimedOut: timedOut,
            candidatesByType: { ...this.candidatesByType },
            stunReached,
            turnReached,
        };
        this.lastDiagnostics = diag;
        this.stunReached = stunReached;
        this.emit("iceDiagnostics", diag);

        if (timedOut) this.emitIssue("ICE_GATHERING_TIMEOUT");
        if (timedOut && !stunReached) this.emitIssue("STUN_UNREACHABLE");
        if (this.candidatesByType.host === 0) this.emitIssue("NO_HOST_CANDIDATES");

        this.watchForSymmetricNat();
    }

    /**
     * Espera a coleta acabar, e devolve se o teto venceu antes disso.
     *
     * Há três jeitos de acabar. O `iceGatheringState` virar `complete` é o do navegador. O
     * segundo existe porque o `@roamhq/wrtc` **nunca** chega a `complete` quando há servidor
     * STUN configurado: medido, ele entrega os 16 candidatos em 40 ms e fica em `gathering`
     * para sempre. Então o silêncio depois do último candidato também encerra — mas só
     * depois de o STUN ter respondido, porque enquanto não veio candidato `srflx` é ele que
     * se está esperando, e desistir antes mandaria um SDP sem endereço público. O terceiro é
     * o teto, e só ele conta como estouro.
     */
    private raceGatheringWithTimeout(): Promise<boolean> {
        if (this.pc.iceGatheringState === "complete") return Promise.resolve(false);

        return new Promise<boolean>((resolve) => {
            let quiet: ReturnType<typeof setTimeout> | null = null;

            const finish = (timedOut: boolean) => {
                this.pc.removeEventListener("icegatheringstatechange", handler);
                this.pc.removeEventListener("icecandidate", onCandidate);
                if (quiet) clearTimeout(quiet);
                clearTimeout(timer);
                resolve(timedOut);
            };

            const handler = () => {
                if (this.pc.iceGatheringState !== "complete") return;
                finish(false);
            };

            const onCandidate = () => {
                if (this.candidatesByType.srflx === 0) return;
                if (quiet) clearTimeout(quiet);
                quiet = setTimeout(() => finish(false), GATHERING_QUIET_MS);
            };

            const timer = setTimeout(() => finish(true), this.gatheringTimeoutMs);

            this.pc.addEventListener("icegatheringstatechange", handler);
            this.pc.addEventListener("icecandidate", onCandidate);
            // O STUN pode ter respondido antes de chegarmos aqui: sem isto a espera ficaria
            // presa no teto, porque nenhum candidato novo viria para começar o silêncio.
            onCandidate();
        });
    }

    /**
     * A janela só abre quando as duas descrições estão na mesa: antes disso não existe
     * verificação de conectividade nenhuma, e o "não conectou" seria apenas a chamada ainda
     * tocando. Era o que fazia sair um `SYMMETRIC_NAT_SUSPECTED` em toda chamada que demora
     * dez segundos para o contato atender.
     */
    private watchForSymmetricNat(): void {
        if (!this.stunReached || !this.negotiated) return;
        if (this.symmetricNatTimer) return;
        this.symmetricNatTimer = setTimeout(() => {
            const noConnection =
                this.pc.iceConnectionState !== "connected" && this.pc.iceConnectionState !== "completed";
            if (noConnection) this.emitIssue("SYMMETRIC_NAT_SUSPECTED");
        }, SYMMETRIC_NAT_DETECTION_WINDOW_MS);
    }

    private emitIssue(issue: ConnectivityIssue): void {
        if (this._emittedConnectivityIssues.has(issue)) return;
        this._emittedConnectivityIssues.add(issue);
        this.emit("connectivityIssue", issue);
    }

    private setStatus(status: TransportStatus): void {
        this.status = status;
        this.emit("statusChanged", status);
    }
}
