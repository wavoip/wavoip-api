import type { CallStats } from "@/modules/call/Stats";
import type { Events, ITransport, TransportStatus } from "@/modules/media/ITransport";
import type { MediaManager } from "@/modules/media/MediaManager";
import { EventEmitter } from "@/modules/shared/EventEmitter";

export class WebRTCTransport extends EventEmitter<Events> implements ITransport {
    status: TransportStatus = "disconnected";
    peerMuted = false;
    audioAnalyser: Promise<AnalyserNode>;
    stats: CallStats = {
        rtt: {
            min: 0,
            max: 0,
            avg: 0,
        },
        tx: {
            total: 0,
            total_bytes: 0,
            loss: 0,
        },
        rx: {
            total: 0,
            total_bytes: 0,
            loss: 0,
        },
    };

    readonly answer: Promise<RTCSessionDescriptionInit>;

    private pc: RTCPeerConnection;
    private offer: RTCSessionDescriptionInit;
    private answerResolver: PromiseWithResolvers<RTCSessionDescriptionInit>;
    private muteCheckJob = 0;
    private statsJob = 0;

    constructor(
        private readonly mediaManager: MediaManager,
        offer: string,
    ) {
        super();

        this.pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        this.offer = { type: "offer", sdp: offer };

        const { promise: audioAnalyserPromise, resolve: resolveAudioAnalyser } = Promise.withResolvers<AnalyserNode>();
        this.audioAnalyser = audioAnalyserPromise;

        this.answerResolver = Promise.withResolvers<RTCSessionDescriptionInit>();
        this.answer = this.answerResolver.promise;

        this.pc.ontrack = (event) => {
            const remoteStream = event.streams[0];

            const audio = new Audio();
            audio.muted = true;
            audio.srcObject = remoteStream;

            const source = this.mediaManager.audioContext.createMediaStreamSource(remoteStream);
            const analyser = this.mediaManager.audioContext.createAnalyser();
            analyser.fftSize = 256;

            source.connect(analyser);
            analyser.connect(this.mediaManager.audioContext.destination);

            resolveAudioAnalyser(analyser);
        };

        this.pc.onconnectionstatechange = () => {
            if (this.pc.connectionState === "connecting") {
                this.setStatus("connecting");
            }

            if (this.pc.connectionState === "disconnected" || this.pc?.connectionState === "closed") {
                this.setStatus("disconnected");
            }

            if (this.pc.connectionState === "closed") {
                this.mediaManager.stopMedia();
            }

            if (this.pc.connectionState === "connected") {
                this.setStatus("connected");
            }
        };
    }

    async start(): Promise<void> {
        const micStream = await this.mediaManager.startMedia();

        for (const track of micStream.getTracks()) {
            track.enabled = true;
            this.pc.addTrack(track, micStream);
        }

        await this.pc.setRemoteDescription(this.offer);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);

        // Wait for ICE gathering to complete so the answer SDP contains all candidates.
        if (this.pc.iceGatheringState !== "complete") {
            await new Promise<void>((resolve) => {
                this.pc.addEventListener("icegatheringstatechange", () => {
                    if (this.pc.iceGatheringState === "complete") resolve();
                });
            });
        }

        this.answerResolver.resolve(this.pc.localDescription as RTCSessionDescription);

        this.getStats(this.pc);

        const audioAnalyser = await this.audioAnalyser;
        this.muteCheckJob = setInterval(() => this.checkForMute(audioAnalyser), 1_000) as unknown as number;
        this.statsJob = setInterval(() => this.getStats(this.pc), 5_000) as unknown as number;
    }

    async stop(): Promise<void> {
        clearInterval(this.muteCheckJob);
        clearInterval(this.statsJob);

        this.pc.close();
        await this.mediaManager.stopMedia();
    }

    private setStatus(status: TransportStatus) {
        this.status = status;
        this.emit("statusChanged", status);
    }

    private checkForMute(analyser: AnalyserNode) {
        const data = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(data);

        const avg = data.reduce((sum, v) => sum + Math.abs(v - 128), 0) / data.length;

        if (avg < 0.05 && !this.peerMuted) {
            this.peerMuted = true;
            this.emit("peerMuted", this.peerMuted);
        }

        if (avg >= 0.05 && this.peerMuted) {
            this.peerMuted = false;
            this.emit("peerMuted", this.peerMuted);
        }
    }

    private async getStats(pc: RTCPeerConnection) {
        const stats = await pc.getStats();

        for (const stat of stats.values()) {
            if (stat.type === "inbound-rtp" && stat.kind === "audio") {
                const inbound = stat as RTCInboundRtpStreamStats;
                if (inbound.bytesReceived) this.stats.rx.total_bytes += inbound.bytesReceived;
                if (inbound.packetsLost) this.stats.rx.loss = inbound.packetsLost;
                if (inbound.packetsReceived) this.stats.rx.total = inbound.packetsReceived;
            }

            if (stat.type === "outbound-rtp" && stat.kind === "audio") {
                const outbound = stat as RTCOutboundRtpStreamStats;
                if (outbound.bytesSent) this.stats.tx.total_bytes += outbound.bytesSent;
            }

            if (stat.type === "remote-inbound-rtp" && stat.kind === "audio") {
                if (stat.packetsLost) this.stats.tx.loss = stat.packetsLost;
                if (stat.packetsReceived) this.stats.tx.total = stat.packetsReceived;

                if (stat.roundTripTime && stat.roundTripTimeMeasurements) {
                    this.stats.rtt.avg += (stat.roundTripTime - this.stats.rtt.avg) / stat.roundTripTimeMeasurements;

                    if (this.stats.rtt.min === 0 || this.stats.rtt.min > stat.roundTripTime)
                        this.stats.rtt.min = stat.roundTripTime;

                    if (this.stats.rtt.max < stat.roundTripTime) this.stats.rtt.max = stat.roundTripTime;
                }
            }
        }

        this.emit("statsChanged", this.stats);
    }
}
