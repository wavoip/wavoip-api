import type { CallStats } from "@/domain/call/stats";
import type { MediaPlan } from "@/domain/call/types";
import { RTCAudioPipe, RTCConnection, RTCStatsAdapter } from "@/modules/media/composition";
import type { ConnectivityIssue, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import {
    DEFAULT_STATS_TICK_MS,
    type Events,
    type ITransport,
    type TransportOptions,
    type TransportStatus,
} from "@/modules/media/ITransport";
import type { MediaManager } from "@/modules/media/MediaManager";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import type { PeerConnectionLike } from "@/ports/runtime/PeerConnectionPort";

export class WebRTCTransport extends EventEmitter<Events> implements ITransport {
    readonly kind = "webrtc" as const;
    audioAnalyserIn: Promise<AnalyserNode>;
    audioAnalyserOut: Promise<AnalyserNode>;

    private readonly connection: RTCConnection;
    private readonly audioPipe: RTCAudioPipe;
    private readonly statsAdapter: RTCStatsAdapter;
    private readonly hasRemoteOffer: boolean;
    private readonly statsTickMs: number;
    private statsJob = 0;
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

    get stats(): CallStats {
        return this.statsAdapter.snapshot();
    }

    constructor(mediaManager: MediaManager, offer?: string, options?: TransportOptions) {
        super();

        this.hasRemoteOffer = !!offer;
        this.statsTickMs = options?.statsTickMs ?? DEFAULT_STATS_TICK_MS;
        this.connection = new RTCConnection(offer, options?.iceConfig);
        this.audioPipe = new RTCAudioPipe(this.connection.pc, mediaManager);
        this.statsAdapter = new RTCStatsAdapter(this.connection.pc, mediaManager.audioContext);
        this.audioAnalyserIn = this.audioPipe.audioAnalyserIn;
        this.audioAnalyserOut = this.audioPipe.audioAnalyserOut;

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

        await this.tickStats();
        this.statsJob = setInterval(() => void this.tickStats(), this.statsTickMs) as unknown as number;
    }

    async createOffer(): Promise<string> {
        await this.audioPipe.start();
        return this.connection.createOffer();
    }

    async stop(): Promise<void> {
        if (this.stoppedOnce) return;
        this.stoppedOnce = true;
        clearInterval(this.statsJob);
        await this.connection.stop();
        await this.audioPipe.stop();
    }

    async getStats(): Promise<CallStats> {
        await this.statsAdapter.refresh();
        return this.statsAdapter.snapshot();
    }

    private async tickStats(): Promise<void> {
        await this.statsAdapter.refresh();
        this.emit("statsChanged", this.statsAdapter.snapshot());
    }
}
