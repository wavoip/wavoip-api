import type { AudioDevice } from "@/domain/audio/device";
import type { AudioSink, AudioSource } from "@/platform/node/audioIo";
import { NodeAudioEngine } from "@/platform/node/NodeAudioEngine";
import { NodeMicrophone } from "@/platform/node/NodeMicrophone";
import { nodeMediaSocket } from "@/platform/node/nodeMediaSocket";
import { nodePeerConnection } from "@/platform/node/nodePeerConnection";
import { NormalizingSource } from "@/platform/node/NormalizingSource";
import { ResamplingSink } from "@/platform/node/ResamplingSink";
import { SharedAudioSource } from "@/platform/node/SharedAudioSource";
import type { WavoipRuntime } from "@/ports/WavoipRuntime";

/** There is no device to enumerate on a headless host: audio comes from what you passed in. */
const NO_DEVICES = {
    listInputDevices: (): AudioDevice[] => [],
    listOutputDevices: (): AudioDevice[] => [],
    currentInput: null,
    currentOutput: null,
};

/**
 * The runtime for a headless Node process: a bot, an IVR, a recorder. There is no microphone
 * and no speaker, so you say where the audio comes from and where it goes.
 *
 * Hand over whatever your decoder produces — `Int16Array` or `Float32Array`, any sample
 * rate, mono or interleaved stereo — and declare the format on `source` and `sink`. The
 * conversion and the resampling happen here, with a proper anti-aliasing filter.
 */
export function nodeRuntime({ source, sink }: { source: AudioSource; sink: AudioSink }): WavoipRuntime {
    const shared = new SharedAudioSource(new NormalizingSource(source));

    return {
        engine: new NodeAudioEngine(shared, new ResamplingSink(sink)),
        microphone: new NodeMicrophone(shared),
        audio: NO_DEVICES,
        createPeer: nodePeerConnection,
        openSocket: nodeMediaSocket,
    };
}
