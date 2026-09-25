import type { AudioDevice } from "@/domain/audio/device";
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
import type { WavoipRuntime } from "@/ports/WavoipRuntime";

/** There is no device to enumerate on a headless host: audio comes from what you passed in. */
const NO_DEVICES = {
    listInputDevices: (): AudioDevice[] => [],
    listOutputDevices: (): AudioDevice[] => [],
    currentInput: null,
    currentOutput: null,
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
