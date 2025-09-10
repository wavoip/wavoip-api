import type { AudioError } from "@/features/multimedia/audio/types/error";
import type { MultimediaDevice } from "@/features/multimedia/types/multimedia-device";

export class Audio {
    private playback_node: AudioWorkletNode | null;
    private audio_context: AudioContext | null;
    private onError: (err: AudioError) => void;

    public speakers: MultimediaDevice[];

    constructor(params: { onError(err: AudioError): void }) {
        this.audio_context = null;
        this.playback_node = null;
        this.audio_context = null;
        this.speakers = [];
        this.onError = params.onError;
    }

    async start(socket: WebSocket) {
        try {
            this.audio_context = new AudioContext({ sampleRate: 16000, latencyHint: 0 });
        } catch (err) {
            this.onError((err as Error).name as AudioError);
            return;
        }

        await this.audio_context.audioWorklet.addModule(new URL("./AudioWorklet.js", import.meta.url));

        this.playback_node = new AudioWorkletNode(this.audio_context, "audio-data-worklet-stream", {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            channelCount: 1,
            processorOptions: {
                offset: 0,
            },
        });

        socket.addEventListener("message", (event) => {
            if (new Uint8Array(event.data).length === 4) {
                return;
            }

            this.playback_node?.port.postMessage({
                buffer: new Uint8Array(event.data),
            });
        });

        this.playback_node.connect(this.audio_context.destination);
    }

    stop() {
        if (this.playback_node) {
            this.playback_node.port.postMessage({ type: "clear", buffer: [] });
            this.playback_node.disconnect();
            this.playback_node = null;
        }

        if (this.audio_context?.state !== "closed") {
            this.audio_context?.close();
            this.audio_context = null;
        }
    }
}
