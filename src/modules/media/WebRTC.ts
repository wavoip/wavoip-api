import type { CallStats } from "@/modules/call/Stats";
import { RTCConnection, RTCStatsAdapter } from "@/modules/media/composition";
import type { ConnectivityIssue, IceConfig, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import type { Events, ITransport, TransportStatus } from "@/modules/media/ITransport";
import type { MediaManager } from "@/modules/media/MediaManager";
import { EventEmitter } from "@/modules/shared/EventEmitter";

export class WebRTCTransport extends EventEmitter<Events> implements ITransport {
    readonly kind = "webrtc" as const;
    peerMuted = false;
    audioAnalyser: Promise<AnalyserNode>;

    private readonly connection: RTCConnection;
    private readonly statsAdapter: RTCStatsAdapter;
    private readonly hasRemoteOffer: boolean;
    private statsJob = 0;
    private tracksAdded = false;
    private startedOnce = false;
    private stoppedOnce = false;

    get status(): TransportStatus {
        return this.connection.status;
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

    constructor(
        private readonly mediaManager: MediaManager,
        offer?: string,
        iceConfig?: IceConfig,
    ) {
        super();

        this.hasRemoteOffer = !!offer;
        this.connection = new RTCConnection(offer, iceConfig);
        this.statsAdapter = new RTCStatsAdapter(this.connection.pc, this.mediaManager.audioContext);

        this.connection.on("statusChanged", (s) => {
            this.emit("statusChanged", s);
            // Autonomous close (pc.connectionState transitions to "closed" outside
            // of stop()) still needs to release the mic. RTCConnection owns the
            // peer-connection lifecycle but has no MediaManager dependency.
            if (this.connection.pc.connectionState === "closed") void this.mediaManager.stopMedia();
        });
        this.connection.on("iceDiagnostics", (d) => this.emit("iceDiagnostics", d));
        this.connection.on("connectivityIssue", (i) => this.emit("connectivityIssue", i));

        const { promise: audioAnalyserPromise, resolve: resolveAudioAnalyser } = Promise.withResolvers<AnalyserNode>();
        this.audioAnalyser = audioAnalyserPromise;

        // Audio pipe wiring stays here until C7. `ontrack` fires once when the
        // remote stream lands — extract a MediaStream-backed analyser so the
        // peerMute/peerUnmute events and the analyser promise both have a source.
        // The muted <audio> element exists as a Chromium workaround
        // (issues.chromium.org/issues/40094084) to keep audio flowing.
        this.pc.ontrack = (event) => {
            const remoteStream = event.streams[0];

            const audio = new Audio();
            audio.muted = true;
            audio.srcObject = remoteStream;

            const remoteTrack = remoteStream.getAudioTracks()[0];
            if (remoteTrack) {
                remoteTrack.addEventListener("mute", () => {
                    if (this.peerMuted) return;
                    this.peerMuted = true;
                    this.emit("peerMuted", true);
                });
                remoteTrack.addEventListener("unmute", () => {
                    if (!this.peerMuted) return;
                    this.peerMuted = false;
                    this.emit("peerMuted", false);
                });
            }

            const source = this.mediaManager.audioContext.createMediaStreamSource(remoteStream);
            const analyser = this.mediaManager.audioContext.createAnalyser();
            analyser.fftSize = 256;

            source.connect(analyser);
            analyser.connect(this.mediaManager.audioContext.destination);

            resolveAudioAnalyser(analyser);
        };

    }

    async start(): Promise<void> {
        if (this.startedOnce) return;
        this.startedOnce = true;

        if (this.hasRemoteOffer) await this.attachMicTracks();
        await this.connection.start();

        await this.tickStats();
        this.statsJob = setInterval(() => void this.tickStats(), 200) as unknown as number;
    }

    async createOffer(): Promise<string> {
        await this.attachMicTracks();
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
        await this.mediaManager.stopMedia();
    }

    private async attachMicTracks(): Promise<void> {
        if (this.tracksAdded) return;
        this.tracksAdded = true;
        const micStream = await this.mediaManager.startMedia();
        for (const track of micStream.getTracks()) {
            track.enabled = !this.mediaManager.muted;
            this.pc.addTrack(track, micStream);
        }
    }

    private async tickStats(): Promise<void> {
        await this.statsAdapter.refresh();
        this.emit("statsChanged", this.statsAdapter.snapshot());
    }
}
