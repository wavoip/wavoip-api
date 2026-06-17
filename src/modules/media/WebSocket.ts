import type { CallStats } from "@/modules/call/Stats";
import type { Events, ITransport, TransportStatus } from "@/modules/media/ITransport";
import type { MediaManager } from "@/modules/media/MediaManager";
import { EventEmitter } from "@/modules/shared/EventEmitter";

type AudioDataCallback = (data: ArrayBuffer) => void;

// 1000 = Normal Closure (server intentionally ended the connection)
// 1008 = Policy Violation (server rejected the connection, e.g. invalid token)
const NO_RECONNECT_CODES = [1000, 1008];
const RECONNECT_DELAY_MS = 1_000;
const RECONNECT_TIMEOUT_MS = 30_000;
const STATS_TICK_MS = 200;
// PCMU at 8kHz, 20ms frames = 160 bytes / 20ms.
const RX_EXPECTED_INTERVAL_MS = 20;

export class WebsocketTransport extends EventEmitter<Events> implements ITransport {
    public readonly kind = "ws" as const;
    public status: TransportStatus = "connecting";
    public peerMuted = false;
    public audioAnalyser: Promise<AnalyserNode>;
    public stats: CallStats = {
        rtt: { avg: 0, max: 0, min: 0 },
        rx: { loss: 0, total: 0, total_bytes: 0, bitrate_kbps: 0, audio_level: 0, jitter_ms: 0 },
        tx: { loss: 0, total: 0, total_bytes: 0, bitrate_kbps: 0, audio_level: 0 },
        audio_context: { output_latency_ms: 0 },
    };

    private ws?: WebSocket;
    private stopped = false;
    private reconnectDeadline: ReturnType<typeof setTimeout> | null = null;
    private readonly audioIn: AudioInput;
    private readonly audioOut: AudioOutput;

    private statsTimer: ReturnType<typeof setInterval> | null = null;
    private prevRxBytes = 0;
    private prevTxBytes = 0;
    private prevSampleTs = 0;
    private lastRxArrivalTs = 0;

    constructor(
        private readonly mediaManager: MediaManager,
        private readonly server: { host: string; port: string },
        private readonly token: string,
    ) {
        super();

        const ctx = mediaManager.audioContext;

        this.audioIn = new AudioInput(ctx, (data) => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(data);
                this.stats.tx.total_bytes += data.byteLength;
                this.stats.tx.total += 1;
            }
        });
        this.audioOut = new AudioOutput(ctx);
        this.audioAnalyser = this.audioOut.audioAnalyser;
    }

    async start(): Promise<void> {
        await this.mediaManager.waitReady();
        const stream = await this.mediaManager.startMedia();

        this.audioIn.start(stream);
        this.audioOut.start();

        this.ws = this.connect();
        this.startStatsLoop();
    }

    async stop(): Promise<void> {
        this.stopped = true;
        this.clearReconnectDeadline();
        this.stopStatsLoop();

        this.ws?.close();
        this.ws = undefined;

        this.audioIn.stop();
        this.audioOut.stop();

        await this.mediaManager.stopMedia();

        this.setStatus("disconnected");
    }

    private connect(): WebSocket {
        const url = `wss://${this.server.host}:${this.server.port}?token=${this.token}`;

        const ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";

        this.setStatus("connecting");
        this.bindSocketListeners(ws);

        return ws;
    }

    private bindSocketListeners(socket: WebSocket): void {
        socket.addEventListener("open", () => {
            this.clearReconnectDeadline();
            this.setStatus("connected");
        });

        socket.addEventListener("error", () => {
            this.setStatus("disconnected");
        });

        socket.addEventListener("message", (event: MessageEvent) => {
            if ((event.data as ArrayBuffer).byteLength === 4) {
                this.ws?.send("pong");
                return;
            }
            this.trackRxArrival((event.data as ArrayBuffer).byteLength);
            this.audioOut.sendAudioData(event.data as ArrayBuffer);
        });

        socket.addEventListener("close", (event: CloseEvent) => {
            if (this.stopped || NO_RECONNECT_CODES.includes(event.code)) {
                this.setStatus("disconnected");
                return;
            }

            this.setStatus("connecting");

            if (!this.reconnectDeadline) {
                this.reconnectDeadline = setTimeout(() => {
                    this.reconnectDeadline = null;
                    this.setStatus("disconnected");
                }, RECONNECT_TIMEOUT_MS);
            }

            setTimeout(() => {
                if (this.stopped) return;
                this.ws = this.connect();
            }, RECONNECT_DELAY_MS);
        });
    }

    private clearReconnectDeadline(): void {
        if (this.reconnectDeadline) {
            clearTimeout(this.reconnectDeadline);
            this.reconnectDeadline = null;
        }
    }

    private setStatus(status: TransportStatus): void {
        this.status = status;
        this.emit("statusChanged", status);
    }

    private trackRxArrival(byteLength: number): void {
        this.stats.rx.total_bytes += byteLength;
        this.stats.rx.total += 1;

        const now = performance.now();
        if (this.lastRxArrivalTs > 0) {
            const arrivalDelta = now - this.lastRxArrivalTs;
            const d = Math.abs(arrivalDelta - RX_EXPECTED_INTERVAL_MS);
            // RFC 3550 jitter estimate: J += (|D| - J) / 16
            this.stats.rx.jitter_ms += (d - this.stats.rx.jitter_ms) / 16;
        }
        this.lastRxArrivalTs = now;
    }

    private startStatsLoop(): void {
        this.statsTimer = setInterval(() => this.sampleStats(), STATS_TICK_MS);
    }

    private stopStatsLoop(): void {
        if (this.statsTimer) {
            clearInterval(this.statsTimer);
            this.statsTimer = null;
        }
    }

    private sampleStats(): void {
        const now = performance.now();
        const txBytes = this.stats.tx.total_bytes;
        const rxBytes = this.stats.rx.total_bytes;

        if (this.prevSampleTs > 0) {
            const dtSec = (now - this.prevSampleTs) / 1000;
            if (dtSec > 0) {
                this.stats.tx.bitrate_kbps = ((txBytes - this.prevTxBytes) * 8) / dtSec / 1000;
                this.stats.rx.bitrate_kbps = ((rxBytes - this.prevRxBytes) * 8) / dtSec / 1000;
            }
        }
        this.prevTxBytes = txBytes;
        this.prevRxBytes = rxBytes;
        this.prevSampleTs = now;

        this.stats.tx.audio_level = this.audioIn.readLevel();
        this.stats.rx.audio_level = this.audioOut.readLevel();
        this.stats.audio_context.output_latency_ms = this.mediaManager.audioContext.outputLatency * 1000;

        this.emit("statsChanged", this.stats);
    }
}

class AudioInput {
    private source: MediaStreamAudioSourceNode | null = null;
    private resampleNode: AudioWorkletNode | null = null;
    private lastLevel = 0;

    constructor(
        private readonly audioContext: AudioContext,
        private readonly onAudioData: AudioDataCallback,
    ) {}

    start(stream: MediaStream): void {
        this.resampleNode = new AudioWorkletNode(this.audioContext, "resample-processor", {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            channelCount: 1,
        });

        this.resampleNode.port.onmessage = (event) => {
            const data = event.data as ArrayBuffer;
            this.lastLevel = rmsInt16(data);
            this.onAudioData(data);
        };

        this.source = this.audioContext.createMediaStreamSource(stream);
        this.source.connect(this.resampleNode);

        // ResampleProcessor only processes — it does not connect to destination.
        // Output goes to the main thread via port.postMessage. RMS is computed in main
        // thread from the same buffer (AnalyserNode reads empty when no destination path).
    }

    readLevel(): number {
        return this.lastLevel;
    }

    stop(): void {
        if (this.source && this.resampleNode) {
            this.source.disconnect(this.resampleNode);
        }
        if (this.resampleNode) {
            this.resampleNode.port.onmessage = null;
            this.resampleNode.disconnect();
            this.resampleNode = null;
        }
        this.source = null;
        this.lastLevel = 0;
    }
}

function rmsInt16(buf: ArrayBuffer): number {
    const samples = new Int16Array(buf);
    if (samples.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
        const s = samples[i] / 32768;
        sum += s * s;
    }
    return Math.sqrt(sum / samples.length);
}

class AudioOutput {
    private playbackNode: AudioWorkletNode | null = null;
    private analyserNode: AnalyserNode | null = null;
    private lastLevel = 0;

    public readonly audioAnalyser: Promise<AnalyserNode>;
    private readonly analyserResolver: PromiseWithResolvers<AnalyserNode>;

    constructor(private readonly audioContext: AudioContext) {
        this.analyserResolver = Promise.withResolvers<AnalyserNode>();
        this.audioAnalyser = this.analyserResolver.promise;
    }

    readLevel(): number {
        return this.lastLevel;
    }

    start(): void {
        this.playbackNode = new AudioWorkletNode(this.audioContext, "audio-data-worklet-stream", {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            channelCount: 1,
        });

        this.analyserNode = this.audioContext.createAnalyser();
        this.analyserNode.fftSize = 256;

        this.playbackNode.connect(this.analyserNode);
        this.analyserNode.connect(this.audioContext.destination);

        this.analyserResolver.resolve(this.analyserNode);
    }

    /**
     * Send a raw PCMU ArrayBuffer chunk to the output worklet.
     * Transfers ownership to avoid a copy across the worklet boundary.
     */
    sendAudioData(data: ArrayBuffer): void {
        if (!this.playbackNode) return;
        this.lastLevel = rmsInt16(data);
        // Clone before transfer — WebSocket event.data may be reused.
        const copy = data.slice(0);
        this.playbackNode.port.postMessage(copy, [copy]);
    }

    stop(): void {
        this.playbackNode?.port.postMessage({ type: "clear" });
        this.playbackNode?.disconnect();
        this.playbackNode = null;
        this.analyserNode?.disconnect();
        this.analyserNode = null;
        this.lastLevel = 0;
    }
}
