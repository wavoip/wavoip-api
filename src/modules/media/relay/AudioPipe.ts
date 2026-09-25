import type { CallAudio } from "@/domain/call/audio";
import { rmsInt16 } from "@/modules/media/audio-level";
import type { MediaRuntime } from "@/modules/media/ITransport";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import type { AudioHandle, PcmPlayback } from "@/ports/runtime/AudioEnginePort";

type AudioDataCallback = (data: ArrayBuffer) => void;

/**
 * `peerMuted` é sempre `false`: o relay não expõe o mute da track remota. Na chamada
 * UNOFFICIAL o mute do outro lado chega pela sinalização (`call:peer:muted`).
 */
export type PipeEvents = {
    peerMuted: [muted: boolean];
};

const NO_SPECTRUM = new Uint8Array(0);

export class WSAudioPipe extends EventEmitter<PipeEvents> {
    peerMuted = false;
    /**
     * O nível sai do PCM que cruza o relay, que o transporte já mede frame a frame. Espectro
     * não: seria uma FFT por frame no mesmo thread que carrega o áudio, e a chamada não
     * oficial não tem sobra para isso.
     */
    readonly audio: CallAudio = {
        in: { level: () => this.rxLevel, spectrum: () => NO_SPECTRUM },
        out: { level: () => this.txLevel, spectrum: () => NO_SPECTRUM },
    };

    private capture: AudioHandle | null = null;
    private playback: PcmPlayback | null = null;
    private txLevel = 0;
    private rxLevel = 0;
    private started = false;
    private stopped = false;

    constructor(
        private readonly runtime: MediaRuntime,
        private readonly onMicData: AudioDataCallback,
    ) {
        super();
    }

    async start(): Promise<void> {
        if (this.started) return;
        this.started = true;
        const micStream = await this.runtime.microphone.open();

        this.capture = this.runtime.engine.capturePcm(micStream, (pcm) => {
            this.txLevel = rmsInt16(pcm);
            this.onMicData(pcm);
        });
        this.playback = this.runtime.engine.playPcm();
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
        await this.runtime.microphone.close();
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

    readBufferedMs(): number | null {
        return this.playback?.bufferedMs() ?? null;
    }
}
