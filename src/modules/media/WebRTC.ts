import type { CallStats } from "@/modules/call/Stats";
import {
    type ConnectivityIssue,
    DEFAULT_ICE_GATHERING_TIMEOUT_MS,
    DEFAULT_ICE_SERVERS,
    type IceCandidateKind,
    type IceConfig,
    type IceDiagnostics,
} from "@/modules/media/ICEDiagnostics";
import type { Events, ITransport, TransportStatus } from "@/modules/media/ITransport";
import type { MediaManager } from "@/modules/media/MediaManager";
import { EventEmitter } from "@/modules/shared/EventEmitter";

const SYMMETRIC_NAT_DETECTION_WINDOW_MS = 10_000;

export class WebRTCTransport extends EventEmitter<Events> implements ITransport {
    readonly kind = "webrtc" as const;
    status: TransportStatus = "disconnected";
    peerMuted = false;
    audioAnalyser: Promise<AnalyserNode>;
    stats: CallStats = {
        rtt: { min: 0, max: 0, avg: 0 },
        tx: { total: 0, total_bytes: 0, loss: 0, bitrate_kbps: 0, audio_level: 0 },
        rx: { total: 0, total_bytes: 0, loss: 0, bitrate_kbps: 0, audio_level: 0, jitter_ms: 0 },
        audio_context: { output_latency_ms: 0 },
    };

    private prevBytesReceived = 0;
    private prevBytesSent = 0;
    private prevSampleTs = 0;

    readonly answer: Promise<RTCSessionDescriptionInit>;

    private pc: RTCPeerConnection;
    private remoteOffer?: RTCSessionDescriptionInit;
    private answerResolver: PromiseWithResolvers<RTCSessionDescriptionInit>;
    private statsJob = 0;
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
    private symmetricNatTimer = 0;
    private _emittedConnectivityIssues = new Set<ConnectivityIssue>();
    lastDiagnostics: IceDiagnostics | null = null;

    get emittedConnectivityIssues(): ReadonlySet<ConnectivityIssue> {
        return this._emittedConnectivityIssues;
    }

    constructor(
        private readonly mediaManager: MediaManager,
        offer?: string,
        iceConfig?: IceConfig,
    ) {
        super();

        this.gatheringTimeoutMs = iceConfig?.gatheringTimeoutMs ?? DEFAULT_ICE_GATHERING_TIMEOUT_MS;
        const iceServers = iceConfig?.iceServers ?? DEFAULT_ICE_SERVERS;

        this.pc = new RTCPeerConnection({ iceServers });
        if (offer) this.remoteOffer = { type: "offer", sdp: offer };

        const { promise: audioAnalyserPromise, resolve: resolveAudioAnalyser } = Promise.withResolvers<AnalyserNode>();
        this.audioAnalyser = audioAnalyserPromise;

        this.answerResolver = Promise.withResolvers<RTCSessionDescriptionInit>();
        this.answer = this.answerResolver.promise;

        this.pc.onicecandidate = (event) => {
            const candidate = event.candidate;
            if (!candidate) return;
            const kind = candidate.type as IceCandidateKind | undefined;
            if (kind && kind in this.candidatesByType) this.candidatesByType[kind] += 1;
        };

        this.pc.oniceconnectionstatechange = () => {
            if (this.pc.iceConnectionState === "failed") {
                this.emitIssue("ICE_CONNECTION_FAILED");
            }
            if (this.pc.iceConnectionState === "connected" || this.pc.iceConnectionState === "completed") {
                clearTimeout(this.symmetricNatTimer);
            }
        };

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

        this.pc.onconnectionstatechange = () => {
            if (this.pc.connectionState === "connecting") this.setStatus("connecting");
            if (this.pc.connectionState === "disconnected" || this.pc.connectionState === "closed") {
                this.setStatus("disconnected");
            }
            if (this.pc.connectionState === "closed") this.mediaManager.stopMedia();
            if (this.pc.connectionState === "connected") this.setStatus("connected");
        };
    }

    async start(): Promise<void> {
        if (this.started) return;
        this.started = true;

        if (this.remoteOffer) {
            const micStream = await this.mediaManager.startMedia();

            for (const track of micStream.getTracks()) {
                track.enabled = !this.mediaManager.muted;
                this.pc.addTrack(track, micStream);
            }

            await this.pc.setRemoteDescription(this.remoteOffer);
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);

            await this.waitForIceGathering();

            this.answerResolver.resolve(this.pc.localDescription as RTCSessionDescription);
        }

        this.getStats(this.pc);
        this.statsJob = setInterval(() => this.getStats(this.pc), 200) as unknown as number;
    }

    async createOffer(): Promise<string> {
        if (this.offerCreated) return this.pc.localDescription?.sdp as string;
        this.offerCreated = true;

        const micStream = await this.mediaManager.startMedia();

        for (const track of micStream.getTracks()) {
            track.enabled = !this.mediaManager.muted;
            this.pc.addTrack(track, micStream);
        }

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);

        await this.waitForIceGathering();

        return this.pc.localDescription?.sdp as string;
    }

    async setAnswer(sdp: string): Promise<void> {
        await this.pc.setRemoteDescription({ type: "answer", sdp });
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
        this.emit("iceDiagnostics", diag);

        if (timedOut) this.emitIssue("ICE_GATHERING_TIMEOUT");
        if (timedOut && !stunReached) this.emitIssue("STUN_UNREACHABLE");
        if (this.candidatesByType.host === 0) this.emitIssue("NO_HOST_CANDIDATES");

        this.scheduleSymmetricNatCheck(stunReached);
    }

    private raceGatheringWithTimeout(): Promise<boolean> {
        if (this.pc.iceGatheringState === "complete") return Promise.resolve(false);

        return new Promise<boolean>((resolve) => {
            const handler = () => {
                if (this.pc.iceGatheringState !== "complete") return;
                this.pc.removeEventListener("icegatheringstatechange", handler);
                clearTimeout(timer);
                resolve(false);
            };

            const timer = setTimeout(() => {
                this.pc.removeEventListener("icegatheringstatechange", handler);
                resolve(true);
            }, this.gatheringTimeoutMs);

            this.pc.addEventListener("icegatheringstatechange", handler);
        });
    }

    private scheduleSymmetricNatCheck(stunReached: boolean) {
        if (!stunReached) return;
        if (this.symmetricNatTimer) return;
        this.symmetricNatTimer = setTimeout(() => {
            const noConnection =
                this.pc.iceConnectionState !== "connected" && this.pc.iceConnectionState !== "completed";
            if (noConnection) this.emitIssue("SYMMETRIC_NAT_SUSPECTED");
        }, SYMMETRIC_NAT_DETECTION_WINDOW_MS) as unknown as number;
    }

    private emitIssue(issue: ConnectivityIssue) {
        if (this._emittedConnectivityIssues.has(issue)) return;
        this._emittedConnectivityIssues.add(issue);
        this.emit("connectivityIssue", issue);
    }

    async stop(): Promise<void> {
        if (this.stopped) return;
        this.stopped = true;

        clearInterval(this.statsJob);
        clearTimeout(this.symmetricNatTimer);

        this.pc.close();
        await this.mediaManager.stopMedia();
    }

    private setStatus(status: TransportStatus) {
        this.status = status;
        this.emit("statusChanged", status);
    }

    private async getStats(pc: RTCPeerConnection) {
        const report = await pc.getStats();
        let curBytesReceived = 0;
        let curBytesSent = 0;

        for (const stat of report.values()) {
            if (isAudioInbound(stat)) curBytesReceived = this.absorbInbound(stat);
            else if (isAudioOutbound(stat)) curBytesSent = this.absorbOutbound(stat);
            else if (isAudioMediaSource(stat)) this.absorbMediaSource(stat);
            else if (isAudioRemoteInbound(stat)) this.absorbRemoteInbound(stat);
        }

        this.updateBitrateSample(curBytesReceived, curBytesSent);
        this.stats.audio_context.output_latency_ms = this.mediaManager.audioContext.outputLatency * 1000;

        this.emit("statsChanged", this.stats);
    }

    private absorbInbound(stat: RTCInboundRtpStreamStats & { audioLevel?: number; jitter?: number }): number {
        if (stat.bytesReceived) this.stats.rx.total_bytes += stat.bytesReceived;
        if (stat.packetsLost) this.stats.rx.loss = stat.packetsLost;
        if (stat.packetsReceived) this.stats.rx.total = stat.packetsReceived;
        if (typeof stat.audioLevel === "number") this.stats.rx.audio_level = stat.audioLevel;
        if (typeof stat.jitter === "number") this.stats.rx.jitter_ms = stat.jitter * 1000;
        return stat.bytesReceived ?? 0;
    }

    private absorbOutbound(stat: RTCOutboundRtpStreamStats): number {
        if (stat.bytesSent) this.stats.tx.total_bytes += stat.bytesSent;
        return stat.bytesSent ?? 0;
    }

    private absorbMediaSource(stat: { audioLevel?: number }): void {
        if (typeof stat.audioLevel === "number") this.stats.tx.audio_level = stat.audioLevel;
    }

    private absorbRemoteInbound(stat: RemoteInboundAudioStat): void {
        if (stat.packetsLost) this.stats.tx.loss = stat.packetsLost;
        if (stat.packetsReceived) this.stats.tx.total = stat.packetsReceived;
        if (!stat.roundTripTime || !stat.roundTripTimeMeasurements) return;
        this.foldRtt(stat.roundTripTime, stat.roundTripTimeMeasurements);
    }

    private foldRtt(rtt: number, measurements: number): void {
        this.stats.rtt.avg += (rtt - this.stats.rtt.avg) / measurements;
        if (this.stats.rtt.min === 0 || this.stats.rtt.min > rtt) this.stats.rtt.min = rtt;
        if (this.stats.rtt.max < rtt) this.stats.rtt.max = rtt;
    }

    private updateBitrateSample(curBytesReceived: number, curBytesSent: number): void {
        const now = performance.now();
        if (this.prevSampleTs > 0) {
            const dtSec = (now - this.prevSampleTs) / 1000;
            if (dtSec > 0) {
                this.stats.rx.bitrate_kbps = ((curBytesReceived - this.prevBytesReceived) * 8) / dtSec / 1000;
                this.stats.tx.bitrate_kbps = ((curBytesSent - this.prevBytesSent) * 8) / dtSec / 1000;
            }
        }
        this.prevBytesReceived = curBytesReceived;
        this.prevBytesSent = curBytesSent;
        this.prevSampleTs = now;
    }
}

type RemoteInboundAudioStat = RTCStats & {
    kind: "audio";
    packetsLost?: number;
    packetsReceived?: number;
    roundTripTime?: number;
    roundTripTimeMeasurements?: number;
};

function isAudioInbound(s: RTCStats): s is RTCInboundRtpStreamStats & { audioLevel?: number; jitter?: number } {
    return s.type === "inbound-rtp" && (s as RTCInboundRtpStreamStats).kind === "audio";
}

function isAudioOutbound(s: RTCStats): s is RTCOutboundRtpStreamStats {
    return s.type === "outbound-rtp" && (s as RTCOutboundRtpStreamStats).kind === "audio";
}

function isAudioMediaSource(s: RTCStats): s is RTCStats & { audioLevel?: number } {
    return s.type === "media-source" && (s as { kind?: string }).kind === "audio";
}

function isAudioRemoteInbound(s: RTCStats): s is RemoteInboundAudioStat {
    return s.type === "remote-inbound-rtp" && (s as RemoteInboundAudioStat).kind === "audio";
}
