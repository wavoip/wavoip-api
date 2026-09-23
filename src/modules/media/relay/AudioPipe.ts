import { rmsInt16 } from "@/modules/media/audio-level";
import type { AudioRuntime } from "@/modules/media/ITransport";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import type { WebAudioHandle } from "@/platform/web/WebAudioEngine";
import type { PcmPlayback } from "@/ports/runtime/AudioEnginePort";

type AudioDataCallback = (data: ArrayBuffer) => void;

/**
 * `peerMuted` é sempre `false`: o relay não expõe o mute da track remota. Na chamada
 * UNOFFICIAL o mute do outro lado chega pela sinalização (`call:peer:muted`).
 */
export type PipeEvents = {
    peerMuted: [muted: boolean];
};

export class WSAudioPipe extends EventEmitter<PipeEvents> {
    peerMuted = false;
    readonly audioAnalyserIn: Promise<AnalyserNode>;
    readonly audioAnalyserOut: Promise<AnalyserNode>;

    private readonly meterInResolver: PromiseWithResolvers<AnalyserNode>;
    private readonly meterOutResolver: PromiseWithResolvers<AnalyserNode>;
    private capture: WebAudioHandle | null = null;
    private playback: (PcmPlayback & WebAudioHandle) | null = null;
    private txLevel = 0;
    private rxLevel = 0;
    private started = false;
    private stopped = false;

    constructor(
        private readonly audio: AudioRuntime,
        private readonly onMicData: AudioDataCallback,
    ) {
        super();

        this.meterInResolver = Promise.withResolvers<AnalyserNode>();
        this.audioAnalyserIn = this.meterInResolver.promise;
        this.meterOutResolver = Promise.withResolvers<AnalyserNode>();
        this.audioAnalyserOut = this.meterOutResolver.promise;
    }

    async start(): Promise<void> {
        if (this.started) return;
        this.started = true;
        const micStream = await this.audio.microphone.open();

        this.capture = this.audio.engine.capturePcm(micStream, (pcm) => {
            this.txLevel = rmsInt16(pcm);
            this.onMicData(pcm);
        });
        this.playback = this.audio.engine.playPcm();

        this.meterOutResolver.resolve(this.capture.analyser);
        this.meterInResolver.resolve(this.playback.analyser);
    }

    async stop(): Promise<void> {
        if (this.stopped) return;
        this.stopped = true;
        this.capture?.stop();
        this.playback?.stop();
        this.capture = null;
        this.playback = null;
        this.txLevel = 0;
        this.rxLevel = 0;
        await this.audio.microphone.close();
    }

    playInbound(data: ArrayBuffer): void {
        if (!this.playback) return;
        this.rxLevel = rmsInt16(data);
        this.playback.write(data);
    }

    readTxLevel(): number {
        return this.txLevel;
    }

    readRxLevel(): number {
        return this.rxLevel;
    }
}
