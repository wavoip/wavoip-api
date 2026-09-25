import type { AudioControl, AudioDevice } from "@/index";
import { Result } from "@/index";
import { type AudioSink, type AudioSource, SAMPLE_RATE } from "@/platform/node/audioIo";
import { NodeAudioEngine } from "@/platform/node/NodeAudioEngine";
import { NodeMicrophone } from "@/platform/node/NodeMicrophone";
import { nodeMediaSocket } from "@/platform/node/nodeMediaSocket";
import { nodePeerConnection } from "@/platform/node/nodePeerConnection";
import { NormalizingSource } from "@/platform/node/NormalizingSource";
import { LocalConverter, type PcmConverter } from "@/platform/node/PcmConverter";
import { ResamplingSink } from "@/platform/node/ResamplingSink";
import { SharedAudioSource } from "@/platform/node/SharedAudioSource";
import { WorkerConverter } from "@/platform/node/WorkerConverter";
// O tipo vem de `@/index`, e não de `@/ports/...`, de propósito. A entrada desta plataforma
// faz `export * from "@/index"`, e o gerador de `.d.ts` trata o símbolo reexportado por ali
// como distinto do mesmo símbolo importado da origem: o resultado eram 23 tipos duplicados
// na superfície pública, com o runtime saindo como `WavoipRuntime_2`, que nem é exportado.
import type { WavoipRuntime } from "@/index";

/**
 * There is no device to enumerate on a headless host: audio comes from the `source` and
 * `sink` you passed in, and choosing between devices that do not exist has no meaning.
 */
const NO_DEVICES: AudioControl = {
    listInputDevices: (): AudioDevice[] => [],
    listOutputDevices: (): AudioDevice[] => [],
    currentInput: null,
    currentOutput: null,
    selectInput: async () => Result.fail("INPUT_SELECTION_UNSUPPORTED"),
    selectOutput: async () => Result.fail("OUTPUT_SELECTION_UNSUPPORTED"),
};

export type NodeRuntimeOptions = {
    source: AudioSource;
    sink: AudioSink;
    /**
     * Resample on a worker thread instead of the main one. Off by default.
     *
     * It does not make resampling faster — it moves it off the event loop, so signalling and
     * sockets stop waiting behind it. Worth it when many calls run at once and their rates
     * differ from 16kHz; pointless when they do not, because then nothing is resampled at all.
     */
    resampleInWorker?: boolean;
};

/**
 * The runtime for a headless Node process: a bot, an IVR, a recorder. There is no microphone
 * and no speaker, so you say where the audio comes from and where it goes.
 *
 * Hand over whatever your decoder produces — `Int16Array` or `Float32Array`, any sample
 * rate, mono or interleaved stereo — and declare the format on `source` and `sink`. The
 * conversion and the resampling happen here, with a proper anti-aliasing filter.
 */
export function nodeRuntime({ source, sink, resampleInWorker = false }: NodeRuntimeOptions): WavoipRuntime {
    const converterFor = converterFactory(resampleInWorker);

    const shared = new SharedAudioSource(
        new NormalizingSource(source, converterFor(NormalizingSource.rateOf(source), SAMPLE_RATE)),
    );
    const engine = new NodeAudioEngine(
        shared,
        new ResamplingSink(sink, converterFor(SAMPLE_RATE, ResamplingSink.rateOf(sink))),
    );

    return {
        engine,
        microphone: new NodeMicrophone(shared),
        audio: NO_DEVICES,
        // O áudio é o `source` e o `sink` do integrador: não há aparelho a listar, e a lista
        // vazia não diz nada sobre a chamada poder acontecer.
        usesAudioDevices: false,
        createPeer: nodePeerConnection,
        openSocket: nodeMediaSocket,
    };
}

/**
 * Taxas iguais não viram worker: mandar o PCM a outro thread para ele devolver intacto só
 * somaria uma viagem. E se o worker não subir, o conversor local assume.
 */
function converterFactory(inWorker: boolean): (inputRate: number, outputRate: number) => PcmConverter {
    return (inputRate, outputRate) => {
        if (!inWorker || inputRate === outputRate) return new LocalConverter(inputRate, outputRate);
        return WorkerConverter.Open(inputRate, outputRate) ?? new LocalConverter(inputRate, outputRate);
    };
}
