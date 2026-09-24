import libSampleRateWorkletSource from "@alexanderolsen/libsamplerate-js/dist/libsamplerate.worklet.js?worklet";
import type { AudioEnginePort, AudioHandle, AudioMeter, PcmPlayback } from "@/ports/runtime/AudioEnginePort";
import type { MediaStreamLike } from "@/ports/runtime/PeerConnectionPort";
import micWorkletSource from "../../modules/worklets/AudioWorkletMic.ts?worklet";
import outWorkletSource from "../../modules/worklets/AudioWorkletOut.ts?worklet";

const METER_FFT_SIZE = 256;

/** O motor de áudio do navegador: um `AudioContext`, os três worklets e os `AnalyserNode`. */
export class WebAudioEngine implements AudioEnginePort {
    private readonly context = new AudioContext({ latencyHint: 0 });
    // Preguiçoso para um motor construído e nunca usado não pagar o addModule dos worklets.
    private worklets: Promise<void> | null = null;

    /**
     * `baseLatency` é o quantum do grafo e `outputLatency` é o buffer do aparelho: o que sai
     * daqui até virar som são os dois. O Safari não implementa o segundo, e aí não há medida.
     */
    get outputLatency(): number | null {
        const total = this.context.baseLatency + this.context.outputLatency;
        return Number.isFinite(total) ? total : null;
    }

    prepare(): Promise<void> {
        if (this.worklets) return this.worklets;
        const sources = [libSampleRateWorkletSource, micWorkletSource, outWorkletSource];
        this.worklets = Promise.all(sources.map((source) => this.addWorklet(source))).then(() => this.suspend());
        return this.worklets;
    }

    /**
     * A Blob URL nasce aqui, e não no import do módulo: criá-la no import faz `import
     * "@wavoip/wavoip-api"` já depender de `URL.createObjectURL`, que o React Native não
     * tem — e contradiz o `sideEffects: false` do pacote.
     */
    private async addWorklet(source: string): Promise<void> {
        const url = URL.createObjectURL(new Blob([source], { type: "application/javascript" }));
        try {
            await this.context.audioWorklet.addModule(url);
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    async resume(): Promise<void> {
        if (this.context.state === "suspended") await this.context.resume();
    }

    async suspend(): Promise<void> {
        if (this.context.state !== "closed") await this.context.suspend();
    }

    close(): Promise<void> {
        return this.context.close();
    }

    /**
     * Bug do Chromium (issues.chromium.org/issues/40094084): sem um `HTMLAudioElement`
     * segurando o `MediaStream`, a cadeia analyser/destination da track remota não recebe
     * áudio. O elemento fica mudo — ele só serve de âncora.
     */
    playStream(stream: MediaStreamLike): AudioMeter {
        const anchor = new Audio();
        anchor.muted = true;
        anchor.srcObject = stream as unknown as MediaStream;

        const source = this.sourceOf(stream);
        const analyser = this.createMeter();
        source.connect(analyser);
        analyser.connect(this.context.destination);

        return {
            level: () => levelOf(analyser),
            stop: () => {
                source.disconnect();
                analyser.disconnect();
                anchor.srcObject = null;
            },
        };
    }

    /**
     * O `AnalyserNode` lê vazio sem caminho até o destination; o ganho zero mantém o grafo
     * renderizando sem devolver o microfone no alto-falante.
     */
    monitorStream(stream: MediaStreamLike): AudioMeter {
        const source = this.sourceOf(stream);
        const analyser = this.createMeter();
        const silence = this.silentSink();
        source.connect(analyser);
        analyser.connect(silence);

        return {
            level: () => levelOf(analyser),
            stop: () => {
                source.disconnect();
                analyser.disconnect();
                silence.disconnect();
            },
        };
    }

    capturePcm(stream: MediaStreamLike, onFrame: (pcm: ArrayBuffer) => void): AudioHandle {
        const source = this.sourceOf(stream);
        const resampler = new AudioWorkletNode(this.context, "resample-processor", {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            channelCount: 1,
        });
        resampler.port.onmessage = (event) => onFrame(event.data as ArrayBuffer);
        source.connect(resampler);

        // O reamostrador não vai ao destination, e um ramo solto não é renderizado: o ganho
        // zero é o que mantém o microfone rendendo quadros sem ecoar no alto-falante.
        const silence = this.silentSink();
        source.connect(silence);

        return {
            stop: () => {
                resampler.port.onmessage = null;
                resampler.disconnect();
                source.disconnect();
                silence.disconnect();
            },
        };
    }

    playPcm(): PcmPlayback {
        const playback = new AudioWorkletNode(this.context, "audio-data-worklet-stream", {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            channelCount: 1,
        });
        playback.connect(this.context.destination);

        let buffered: number | null = null;
        playback.port.onmessage = (event) => {
            const report = event.data as { type?: string; ms?: number };
            if (report?.type === "buffered" && typeof report.ms === "number") buffered = report.ms;
        };

        return {
            bufferedMs: () => buffered,
            write: (pcm) => {
                // Copia antes de transferir: o event.data do WebSocket pode ser reutilizado.
                const copy = pcm.slice(0);
                playback.port.postMessage(copy, [copy]);
            },
            stop: () => {
                playback.port.postMessage({ type: "clear" });
                playback.port.onmessage = null;
                playback.disconnect();
            },
        };
    }

    /** Um caminho mudo até o destination, que é o que faz o grafo renderizar o ramo. */
    private silentSink(): GainNode {
        const silence = this.context.createGain();
        silence.gain.value = 0;
        silence.connect(this.context.destination);
        return silence;
    }

    private sourceOf(stream: MediaStreamLike): MediaStreamAudioSourceNode {
        return this.context.createMediaStreamSource(stream as unknown as MediaStream);
    }

    private createMeter(): AnalyserNode {
        const analyser = this.context.createAnalyser();
        analyser.fftSize = METER_FFT_SIZE;
        return analyser;
    }
}

/** RMS do que o analisador tem agora, normalizado de 0 a 1 em cima do zero em 128. */
function levelOf(analyser: AnalyserNode): number {
    const samples = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(samples);

    let sum = 0;
    for (const sample of samples) {
        const centred = (sample - 128) / 128;
        sum += centred * centred;
    }
    return Math.sqrt(sum / samples.length);
}
