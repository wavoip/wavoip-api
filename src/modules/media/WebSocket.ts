import type { CallStats } from "@/modules/call/Stats";
import { rmsInt16 } from "@/modules/media/audio-level";
import { WSConnection, WSStatsAdapter } from "@/modules/media/composition";
import type { Events, ITransport, TransportStatus } from "@/modules/media/ITransport";
import type { MediaManager } from "@/modules/media/MediaManager";
import { EventEmitter } from "@/modules/shared/EventEmitter";

type AudioDataCallback = (data: ArrayBuffer) => void;

const STATS_TICK_MS = 200;

export class WebsocketTransport extends EventEmitter<Events> implements ITransport {
    public readonly kind = "ws" as const;
    public peerMuted = false;
    public audioAnalyser: Promise<AnalyserNode>;

    get status(): TransportStatus {
        return this.connection.status;
    }

    get stats(): CallStats {
        return this.statsAdapter.snapshot();
    }

    private readonly connection: WSConnection;
    private readonly audioIn: AudioInput;
    private readonly audioOut: AudioOutput;
    private readonly statsAdapter: WSStatsAdapter;

    private statsTimer: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly mediaManager: MediaManager,
        server: { host: string; port: string },
        token: string,
    ) {
        super();

        const ctx = mediaManager.audioContext;

        this.connection = new WSConnection(server, token);

        this.audioIn = new AudioInput(ctx, (data) => {
            this.connection.send(data);
            this.statsAdapter.noteSent(data.byteLength);
        });
        this.audioOut = new AudioOutput(ctx);
        this.audioAnalyser = this.audioOut.audioAnalyser;
        this.statsAdapter = new WSStatsAdapter(ctx, {
            readTxLevel: () => this.audioIn.readLevel(),
            readRxLevel: () => this.audioOut.readLevel(),
        });

        this.connection.on("statusChanged", (s) => this.emit("statusChanged", s));
        this.connection.on("message", (data) => {
            this.statsAdapter.noteReceived(data.byteLength);
            this.audioOut.sendAudioData(data);
        });
    }

    async start(): Promise<void> {
        await this.mediaManager.waitReady();
        const stream = await this.mediaManager.startMedia();

        this.audioIn.start(stream);
        this.audioOut.start();

        await this.connection.start();
        this.startStatsLoop();
    }

    async stop(): Promise<void> {
        this.stopStatsLoop();
        await this.connection.stop();
        this.audioIn.stop();
        this.audioOut.stop();
        await this.mediaManager.stopMedia();
    }

    private startStatsLoop(): void {
        this.statsTimer = setInterval(() => void this.tickStats(), STATS_TICK_MS);
    }

    private stopStatsLoop(): void {
        if (this.statsTimer) {
            clearInterval(this.statsTimer);
            this.statsTimer = null;
        }
    }

    private async tickStats(): Promise<void> {
        await this.statsAdapter.refresh();
        this.emit("statsChanged", this.statsAdapter.snapshot());
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
