import type { CallStats } from "@/modules/call/Stats";
import type { Events, ITransport, TransportStatus } from "@/modules/media/ITransport";
import type { MediaManager } from "@/modules/media/MediaManager";
import { EventEmitter } from "@/modules/shared/EventEmitter";

// 1000 = Normal Closure (server intentionally ended the connection)
// 1008 = Policy Violation (server rejected the connection, e.g. invalid token)
const NO_RECONNECT_CODES = [1000, 1008];
const RECONNECT_DELAY_MS = 1_000;
const RECONNECT_TIMEOUT_MS = 30_000;

export class WebsocketTransport extends EventEmitter<Events> implements ITransport {
    public status: TransportStatus = "connecting";
    public peerMuted = false;
    public audioAnalyser: Promise<AnalyserNode>;
    public stats: CallStats = {
        rtt: { avg: 0, max: 0, min: 0 },
        rx: { loss: 0, total: 0, total_bytes: 0 },
        tx: { loss: 0, total: 0, total_bytes: 0 },
    };

    private ws?: WebSocket;
    private stopped = false;
    private reconnectDeadline: ReturnType<typeof setTimeout> | null = null;
    private readonly audioIn: AudioInput;
    private readonly audioOut: AudioOutput;

    constructor(
        private readonly mediaManager: MediaManager,
        private readonly server: { host: string; port: string },
        private readonly token: string,
    ) {
        super();

        const ctx = mediaManager.audioContext;

        this.audioIn = new AudioInput(ctx);
        this.audioOut = new AudioOutput(ctx);
        this.audioAnalyser = this.audioOut.audioAnalyser;
    }

    async start(): Promise<void> {
        await this.mediaManager.waitReady();
        const stream = await this.mediaManager.startMedia();

        await this.audioIn.start(stream);
        this.audioOut.start();
        this.audioIn.on("audio-data", (data) => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(data);
            }
        });

        this.ws = this.connect();
    }

    async stop(): Promise<void> {
        this.stopped = true;
        this.clearReconnectDeadline();

        this.ws?.close();
        this.ws = undefined;

        await this.audioIn.stop();
        this.audioOut.stop();

        await this.mediaManager.stopMedia();

        this.audioAnalyser = (this.audioOut as unknown as { audioAnalyser: Promise<AnalyserNode> }).audioAnalyser;

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
}

type AudioInputEvents = { "audio-data": [data: ArrayBuffer] };

class AudioInput extends EventEmitter<AudioInputEvents> {
    private source: MediaStreamAudioSourceNode | null = null;
    private resampleNode: AudioWorkletNode | null = null;

    constructor(private readonly audioContext: AudioContext) {
        super();
    }

    async start(stream: MediaStream): Promise<void> {
        this.resampleNode = new AudioWorkletNode(this.audioContext, "resample-processor", {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            channelCount: 1,
        });

        this.resampleNode.port.onmessage = (event) => {
            this.emit("audio-data", event.data as ArrayBuffer);
        };

        this.source = this.audioContext.createMediaStreamSource(stream);
        this.source.connect(this.resampleNode);

        // ResampleProcessor only processes — it does not connect to destination.
        // Output goes to the main thread via port.postMessage.
    }

    async stop(): Promise<void> {
        if (this.source && this.resampleNode) {
            this.source.disconnect(this.resampleNode);
        }
        if (this.resampleNode) {
            this.resampleNode.port.onmessage = null;
            this.resampleNode.disconnect();
            this.resampleNode = null;
        }
        this.source = null;
        this.removeAllListeners();
    }
}

class AudioOutput {
    private playbackNode: AudioWorkletNode | null = null;
    private analyserNode: AnalyserNode | null = null;

    private audioAnalyserDefer: {
        resolve?: (node: AnalyserNode | PromiseLike<AnalyserNode>) => void;
    } = {};

    public readonly audioAnalyser: Promise<AnalyserNode>;

    constructor(private readonly audioContext: AudioContext) {
        this.audioAnalyser = new Promise<AnalyserNode>((resolve) => {
            this.audioAnalyserDefer = { resolve };
        });
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

        this.audioAnalyserDefer.resolve?.(this.analyserNode);
    }

    /**
     * Send a raw PCMU ArrayBuffer chunk to the output worklet.
     * Transfers ownership to avoid a copy across the worklet boundary.
     */
    sendAudioData(data: ArrayBuffer): void {
        if (!this.playbackNode) return;
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
    }
}
