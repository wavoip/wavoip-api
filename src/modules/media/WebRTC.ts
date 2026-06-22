import type { CallStats } from "@/modules/call/Stats";
import { RTCAudioPipe, RTCConnection, RTCStatsAdapter } from "@/modules/media/composition";
import type { ConnectivityIssue, IceConfig, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import type { Events, ITransport, TransportStatus } from "@/modules/media/ITransport";
import type { MediaManager } from "@/modules/media/MediaManager";
import { EventEmitter } from "@/modules/shared/EventEmitter";

export class WebRTCTransport extends EventEmitter<Events> implements ITransport {
    readonly kind = "webrtc" as const;
    audioAnalyser: Promise<AnalyserNode>;

    private readonly connection: RTCConnection;
    private readonly audioPipe: RTCAudioPipe;
    private readonly statsAdapter: RTCStatsAdapter;
    private readonly hasRemoteOffer: boolean;
    private statsJob = 0;
    private startedOnce = false;
    private stoppedOnce = false;

    get status(): TransportStatus {
        return this.connection.status;
    }

    get peerMuted(): boolean {
        return this.audioPipe.peerMuted;
    }

    get pc(): RTCPeerConnection {
        return this.connection.pc;
    }

    get answer(): Promise<RTCSessionDescriptionInit> {
        return this.connection.answer;
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

    constructor(mediaManager: MediaManager, offer?: string, iceConfig?: IceConfig) {
        super();

        this.hasRemoteOffer = !!offer;
        this.connection = new RTCConnection(offer, iceConfig);
        this.audioPipe = new RTCAudioPipe(this.connection.pc, mediaManager);
        this.statsAdapter = new RTCStatsAdapter(this.connection.pc, mediaManager.audioContext);
        this.audioAnalyser = this.audioPipe.audioAnalyser;

        this.audioPipe.on("peerMuted", (m) => this.emit("peerMuted", m));
        this.connection.on("iceDiagnostics", (d) => this.emit("iceDiagnostics", d));
        this.connection.on("connectivityIssue", (i) => this.emit("connectivityIssue", i));
        this.connection.on("statusChanged", (s) => {
            this.emit("statusChanged", s);
            // Autonomous close (pc.connectionState transitions to "closed" outside
            // stop()) still needs to release the mic. RTCConnection has no
            // MediaManager dependency; the pipe owns mic lifecycle.
            if (this.connection.pc.connectionState === "closed") void this.audioPipe.stop();
        });
    }

    async start(): Promise<void> {
        if (this.startedOnce) return;
        this.startedOnce = true;

        if (this.hasRemoteOffer) await this.audioPipe.start();
        await this.connection.start();

        await this.tickStats();
        this.statsJob = setInterval(() => void this.tickStats(), 200) as unknown as number;
    }

    async createOffer(): Promise<string> {
        await this.audioPipe.start();
        return this.connection.createOffer();
    }

    async setAnswer(sdp: string): Promise<void> {
        await this.connection.setAnswer(sdp);
    }

    async stop(): Promise<void> {
        if (this.stoppedOnce) return;
        this.stoppedOnce = true;
        clearInterval(this.statsJob);
        await this.connection.stop();
        await this.audioPipe.stop();
    }

    private async tickStats(): Promise<void> {
        await this.statsAdapter.refresh();
        this.emit("statsChanged", this.statsAdapter.snapshot());
    }
}
