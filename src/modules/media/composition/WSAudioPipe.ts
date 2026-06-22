import { rmsInt16 } from "@/modules/media/audio-level";
import type { MediaManager } from "@/modules/media/MediaManager";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import type { IAudioPipe, PipeEvents } from "./AudioPipe";

type AudioDataCallback = (data: ArrayBuffer) => void;

/**
 * WebSocket audio pipe role — owns mic resampling (Int16 PCM out, sent via the
 * `onMicData` callback) and speaker playback (raw Int16 PCM in via
 * `playInbound`). Bundles the prior `AudioInput` + `AudioOutput` inner classes
 * under a single role so `WebsocketTransport` composes one pipe object rather
 * than juggling two.
 *
 * `peerMuted` is permanently `false`: the WS transport has no native peer-mute
 * signal (the relay server doesn't surface remote-track mute state). Listeners
 * that need it for UNOFFICIAL calls observe `peerMuted` via signaling events.
 *
 * Stats use the `readTxLevel` / `readRxLevel` accessors — `WSStatsAdapter`
 * samples mic+speaker RMS through this pipe per `refresh()`.
 */
export class WSAudioPipe extends EventEmitter<PipeEvents> implements IAudioPipe {
    peerMuted = false;
    readonly audioAnalyser: Promise<AnalyserNode>;

    private readonly audioIn: AudioInput;
    private readonly audioOut: AudioOutput;
    private started = false;
    private stopped = false;

    constructor(
        private readonly mediaManager: MediaManager,
        onMicData: AudioDataCallback,
    ) {
        super();
        const ctx = mediaManager.audioContext;
        this.audioIn = new AudioInput(ctx, onMicData);
        this.audioOut = new AudioOutput(ctx);
        this.audioAnalyser = this.audioOut.audioAnalyser;
    }

    async start(): Promise<void> {
        if (this.started) return;
        this.started = true;
        await this.mediaManager.waitReady();
        const stream = await this.mediaManager.startMedia();
        this.audioIn.start(stream);
        this.audioOut.start();
    }

    async stop(): Promise<void> {
        if (this.stopped) return;
        this.stopped = true;
        this.audioIn.stop();
        this.audioOut.stop();
        await this.mediaManager.stopMedia();
    }

    /** Route an inbound binary frame from the WS to the speaker worklet. */
    playInbound(data: ArrayBuffer): void {
        this.audioOut.sendAudioData(data);
    }

    readTxLevel(): number {
        return this.audioIn.readLevel();
    }

    readRxLevel(): number {
        return this.audioOut.readLevel();
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
