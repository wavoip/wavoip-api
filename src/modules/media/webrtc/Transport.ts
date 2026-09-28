import type { CallAudio } from "@/domain/call/audio";

/** Onde a plataforma não enxerga o áudio, o espectro é vazio — e não uma faixa de zeros. */
const NO_SPECTRUM = new Uint8Array(0);
/** De quanto em quanto a medida do `getStats` é renovada enquanto alguém olha o medidor. */
const STATS_MAX_AGE_MS = 200;
import type { MediaPlan } from "@/domain/call/mediaPlan";
import type { CallStats } from "@/domain/call/stats";
import type { ConnectivityIssue, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import type { Events, ITransport, MediaRuntime, TransportOptions, TransportStatus } from "@/modules/media/ITransport";
import { RTCAudioPipe } from "@/modules/media/webrtc/AudioPipe";
import { RTCConnection } from "@/modules/media/webrtc/Connection";
import { RTCStatsAdapter } from "@/modules/media/webrtc/StatsAdapter";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import type { PeerConnectionFactory, PeerConnectionLike } from "@/ports/runtime/PeerConnectionPort";

export class WebRTCTransport extends EventEmitter<Events> implements ITransport {
    readonly kind = "webrtc" as const;

    private readonly connection: RTCConnection;
    private readonly audioPipe: RTCAudioPipe;
    private readonly statsAdapter: RTCStatsAdapter;
    private statsReadAt = 0;
    private refreshingStats = false;
    private readonly hasRemoteOffer: boolean;
    private startedOnce = false;
    private stoppedOnce = false;

    get status(): TransportStatus {
        return this.connection.status;
    }

    get peerMuted(): boolean {
        return this.audioPipe.peerMuted;
    }

    get pc(): PeerConnectionLike {
        return this.connection.pc;
    }

    get lastDiagnostics(): IceDiagnostics | null {
        return this.connection.lastDiagnostics;
    }

    get emittedConnectivityIssues(): ReadonlySet<ConnectivityIssue> {
        return this.connection.emittedConnectivityIssues;
    }

    /**
     * O nível vem do motor de áudio onde ele passa por aqui, e das estatísticas da conexão
     * onde não passa. No React Native é o segundo caso: o nativo toca e captura sozinho, e o
     * `audioLevel` do `getStats()` é a única medida que existe.
     */
    get audio(): CallAudio {
        const stats = () => this.freshAudioStats();
        const pipe = this.audioPipe.audio;
        return {
            in: {
                level: () => pipe.in.level() ?? stats().rx.level,
                spectrum: () => pipe.in.spectrum() ?? NO_SPECTRUM,
                clipping: () => pipe.in.clipping() ?? 0,
            },
            out: {
                level: () => pipe.out.level() ?? stats().tx.level,
                spectrum: () => pipe.out.spectrum() ?? NO_SPECTRUM,
                clipping: () => pipe.out.clipping() ?? 0,
            },
        };
    }

    get stats(): CallStats {
        return this.statsAdapter.snapshot();
    }

    /**
     * O nível lido das estatísticas sai de um cache, e o `refresh` que o preenche é assíncrono
     * — mas `level()` é síncrono de propósito, para caber num laço de quadro. Então a leitura
     * devolve o que há e pede a próxima medida, que chega a tempo da leitura seguinte.
     *
     * Sem isto o medidor marcava zero para sempre no React Native, que é justamente a única
     * plataforma onde esse cache é a medida: lá o áudio não passa por este processo. Quem lê
     * um medidor não chama `getStats`, e era só ele que preenchia o cache.
     */
    private freshAudioStats(): CallStats["audio"] {
        const now = Date.now();
        if (!this.refreshingStats && now - this.statsReadAt >= STATS_MAX_AGE_MS) {
            this.statsReadAt = now;
            this.refreshingStats = true;
            void this.statsAdapter.refresh().finally(() => {
                this.refreshingStats = false;
            });
        }
        return this.statsAdapter.snapshot().audio;
    }

    constructor(runtime: MediaRuntime, offer?: string, options?: TransportOptions) {
        super();

        this.hasRemoteOffer = !!offer;
        this.connection = new RTCConnection(offer, options?.iceConfig, peerFactoryOf(runtime));
        this.audioPipe = new RTCAudioPipe(this.connection.pc, runtime);
        this.statsAdapter = new RTCStatsAdapter(this.connection.pc, runtime.engine);

        this.audioPipe.on("peerMuted", (m) => this.emit("peerMuted", m));
        this.connection.on("iceDiagnostics", (d) => this.emit("iceDiagnostics", d));
        this.connection.on("connectivityIssue", (i) => this.emit("connectivityIssue", i));
        this.connection.on("statusChanged", (s) => {
            this.emit("statusChanged", s);
            // Um fechamento fora do stop() também tem que liberar o microfone, e quem cuida do
            // microfone é o pipe, não o RTCConnection.
            if (this.connection.pc.connectionState === "closed") void this.audioPipe.stop();
        });
    }

    /** Atende: sobe a mídia e devolve a resposta SDP que o servidor repassa ao outro lado. */
    async accept(): Promise<MediaPlan> {
        await this.start();
        const answer = await this.connection.answer;
        return { type: "webRTC", sdp: answer.sdp as string };
    }

    /** O outro lado atendeu: a resposta dele fecha a negociação e a mídia sobe. */
    async connect(plan: MediaPlan): Promise<void> {
        if (plan.type !== "webRTC") throw new Error(`A WebRTC call cannot connect with a ${plan.type} plan`);
        await this.connection.setAnswer(plan.sdp);
        await this.start();
    }

    private async start(): Promise<void> {
        if (this.startedOnce) return;
        this.startedOnce = true;

        if (this.hasRemoteOffer) await this.audioPipe.start();
        await this.connection.start();
    }

    async createOffer(): Promise<string> {
        await this.audioPipe.start();
        return this.connection.createOffer();
    }

    async stop(): Promise<void> {
        if (this.stoppedOnce) return;
        this.stoppedOnce = true;
        await this.connection.stop();
        await this.audioPipe.stop();
    }

    async getStats(): Promise<CallStats> {
        await this.statsAdapter.refresh();
        return this.statsAdapter.snapshot();
    }
}

/** Sem WebRTC na plataforma não há chamada OFFICIAL, e é melhor dizer isso do que tentar. */
function peerFactoryOf(runtime: MediaRuntime): PeerConnectionFactory {
    // Quem monta o transporte já conferiu que a fábrica existe: sem ela, o `forCall` devolve
    // `null` e a chamada é recusada antes de chegar aqui.
    const { createPeer } = runtime;
    if (!createPeer)
        throw new TypeError(
            `runtime sem createPeer chegou ao WebRTCTransport: ${JSON.stringify(Object.keys(runtime))}`,
        );
    return createPeer;
}
