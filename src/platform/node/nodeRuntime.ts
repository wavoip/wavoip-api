import type { AudioDevice } from "@/domain/audio/device";
import type { AudioSink, AudioSource } from "@/platform/node/audioIo";
import { NodeAudioEngine } from "@/platform/node/NodeAudioEngine";
import { NodeMicrophone } from "@/platform/node/NodeMicrophone";
import { nodeMediaSocket } from "@/platform/node/nodeMediaSocket";
import { nodePeerConnection } from "@/platform/node/nodePeerConnection";
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
 * Both speak Int16 PCM at 16kHz, mono — the same format the library uses end to end, so
 * nothing is resampled on the way through.
 */
export function nodeRuntime({ source, sink }: { source: AudioSource; sink: AudioSink }): WavoipRuntime {
    const shared = new SharedAudioSource(source);

    return {
        engine: new NodeAudioEngine(shared, sink),
        microphone: new NodeMicrophone(shared),
        audio: NO_DEVICES,
        createPeer: nodePeerConnection,
        openSocket: nodeMediaSocket,
    };
}
