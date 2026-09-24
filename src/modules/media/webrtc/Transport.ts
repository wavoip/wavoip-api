import type { CallAudio } from "@/domain/call/audio";
import type { CallStats } from "@/domain/call/stats";
import type { MediaPlan } from "@/domain/call/types";
import { RTCAudioPipe } from "@/modules/media/webrtc/AudioPipe";
import { RTCConnection } from "@/modules/media/webrtc/Connection";
import { RTCStatsAdapter } from "@/modules/media/webrtc/StatsAdapter";
import type { ConnectivityIssue, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import type { MediaRuntime, Events, ITransport, TransportOptions, TransportStatus } from "@/modules/media/ITransport";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import type { PeerConnectionFactory, PeerConnectionLike } from "@/ports/runtime/PeerConnectionPort";

export class WebRTCTransport extends EventEmitter<Events> implements ITransport {
    readonly kind = "webrtc" as const;

    private readonly connection: RTCConnection;
    private readonly audioPipe: RTCAudioPipe;
    private readonly statsAdapter: RTCStatsAdapter;
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

    get audio(): CallAudio {
        return this.audioPipe.audio;
    }

    get stats(): CallStats {
        return this.statsAdapter.snapshot();
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
    if (!runtime.createPeer) throw new Error("This runtime has no WebRTC: official calls are unavailable");
    return runtime.createPeer;
}
