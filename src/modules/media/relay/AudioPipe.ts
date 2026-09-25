import type { CallAudio } from "@/domain/call/audio";
import { SpectrumAnalyser } from "@/domain/audio/SpectrumAnalyser";
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

export class WSAudioPipe extends EventEmitter<PipeEvents> {
    peerMuted = false;

    /**
     * Nível e espectro saem do próprio PCM que cruza o relay, e não do motor de áudio: aqui o
     * áudio passa em claro pelas duas direções, o que não acontece na chamada oficial.
     *
     * Por isso a chamada não oficial tem espectro em toda plataforma, inclusive no React
     * Native — lá o que falta na oficial é justamente o áudio chegar ao JavaScript.
     *
     * A transformada roda quando alguém pede as bandas, não a cada frame: quem não desenha não
     * paga por ela.
     */
    readonly audio: CallAudio = {
        in: { level: () => this.rxLevel, spectrum: () => this.rxSpectrum.bands() },
        out: { level: () => this.txLevel, spectrum: () => this.txSpectrum.bands() },
    };

    private readonly txSpectrum = new SpectrumAnalyser();
    private readonly rxSpectrum = new SpectrumAnalyser();

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
        // Quem abre o microfone é o motor, porque é ele que sabe de onde tira as amostras: no
        // React Native o `getUserMedia` do WebRTC não serve, e abri-lo aqui seria um segundo
        // acesso nativo ao mesmo microfone, sem uso.
        this.capture = await this.runtime.engine.capturePcm(this.runtime.microphone, (pcm) => {
            this.txLevel = rmsInt16(pcm);
            this.txSpectrum.push(new Int16Array(pcm));
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
    }

    playInbound(data: ArrayBuffer): void {
        if (!this.playback) return;
        this.rxLevel = rmsInt16(data);
        this.rxSpectrum.push(new Int16Array(data));
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
