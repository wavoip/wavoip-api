import { EventEmitter } from "@/features/EventEmitter";
import type { CallStats } from "@/features/call/types/call";
import type { Microphone } from "@/features/multimedia/microphone/microphone";
import type { ITransport, TransportStatus } from "@/features/multimedia/transport/ITransport";

type Events = {
    status: [status: TransportStatus];
    stats: [stats: CallStats];
    muted: [muted: boolean];
};

export class WebRTCTransport extends EventEmitter<Events> implements ITransport {
    private pc: RTCPeerConnection | null = null;
    private readonly audioContext: AudioContext;
    private audioAnalyserDeffer: { resolve?: (node: AnalyserNode | PromiseLike<AnalyserNode>) => void } = {};

    private muteInterval: number | null = null;
    private statsInterval: number | null = null;

    public answer: RTCSessionDescriptionInit | null = null;
    public peerMuted = false;
    public audioAnalyser: Promise<AnalyserNode>;
    public status: TransportStatus = "connecting";
    public stats: CallStats;

    constructor(private readonly microphone: Microphone) {
        super();

        this.audioContext = new AudioContext({ sampleRate: 48000, latencyHint: 0 });
        this.audioContext.suspend();
        this.audioAnalyser = new Promise<AnalyserNode>((resolve) => {
            this.audioAnalyserDeffer = { resolve };
        });

        this.stats = {
            rtt: {
                avg: 0,
                max: 0,
                min: 0,
            },
            rx: {
                loss: 0,
                total: 0,
                total_bytes: 0,
            },
            tx: {
                loss: 0,
                total: 0,
                total_bytes: 0,
            },
        };
    }

    async start(offer: RTCSessionDescriptionInit) {
        if (!this.microphone.deviceUsed) return;

        const localStream = this.microphone.deviceUsed.stream;

        if (this.audioContext.state === "suspended") {
            await this.audioContext.resume();
        }

        this.pc = new RTCPeerConnection();

        for (const track of localStream.getTracks()) {
            track.enabled = true;
            this.pc.addTrack(track, localStream);
        }

        this.pc.ontrack = (event) => {
            const remoteStream = event.streams[0];

            const source = this.audioContext.createMediaStreamSource(remoteStream);
            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = 256;

            source.connect(analyser);
            analyser.connect(this.audioContext.destination);

            this.audioAnalyserDeffer.resolve?.(analyser);
            this.getStats(this.pc as RTCPeerConnection);

            this.muteInterval = setInterval(() => this.checkForMute(analyser), 1_000) as unknown as number;
            this.statsInterval = setInterval(
                () => this.getStats(this.pc as RTCPeerConnection),
                5_000,
            ) as unknown as number;
        };

        this.pc.onconnectionstatechange = () => {
            if (this.pc?.connectionState === "connecting") {
                this.setStatus("connecting");
            }

            if (this.pc?.connectionState === "disconnected" || this.pc?.connectionState === "closed") {
                this.setStatus("disconnected");
            }

            if (this.pc?.connectionState === "closed") {
                this.audioContext.suspend();
            }

            if (this.pc?.connectionState === "connected") {
                this.setStatus("connected");
            }
        };

        await this.pc.setRemoteDescription(offer);
        this.answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(this.answer);
    }

    async stop() {
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }

        if (this.audioContext.state === "running") {
            await this.audioContext.suspend();
        }

        this.audioAnalyser = new Promise<AnalyserNode>((resolve) => {
            this.audioAnalyserDeffer = { resolve };
        });

        if (this.muteInterval) clearInterval(this.muteInterval);
        if (this.statsInterval) clearInterval(this.statsInterval);
    }

    private setStatus(status: TransportStatus) {
        this.status = status;
        this.emit("status", status);
    }

    private checkForMute(analyser: AnalyserNode) {
        const data = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(data);

        const avg = data.reduce((sum, v) => sum + Math.abs(v - 128), 0) / data.length;

        if (avg < 0.05 && !this.peerMuted) {
            this.peerMuted = true;
            this.emit("muted", this.peerMuted);
        }

        if (avg >= 0.05 && this.peerMuted) {
            this.peerMuted = false;
            this.emit("muted", this.peerMuted);
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
                if (outbound.bytesSent) this.stats.tx.total_bytes;
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

        this.emit("stats", this.stats);
    }
}
