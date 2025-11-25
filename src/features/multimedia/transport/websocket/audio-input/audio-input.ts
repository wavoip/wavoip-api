import { EventEmitter } from "@/features/EventEmitter";

type Events = {
    "audio-data": [data: unknown];
};

export class AudioInput extends EventEmitter<Events> {
    public source: MediaStreamAudioSourceNode | null;
    public resample_node: AudioWorkletNode | null;
    public ready: Promise<void>;

    constructor(private readonly audio_context: AudioContext) {
        super();

        this.source = null;
        this.resample_node = null;

        this.ready = new Promise<void>((resolve) => {
            this.audio_context.audioWorklet
                .addModule(new URL("./AudioWorkletMic.js", import.meta.url))
                .then(() => resolve());
        });
    }

    async start(stream: MediaStream) {
        if (this.audio_context.state !== "running") {
            await this.audio_context.resume();
        }

        this.resample_node = new AudioWorkletNode(this.audio_context, "resample-processor", {
            processorOptions: { sampleRate: this.audio_context.sampleRate },
        });

        this.resample_node.port.onmessage = (event) => this.emit("audio-data", event.data);

        this.source = this.audio_context.createMediaStreamSource(stream);
        this.source.connect(this.resample_node);
    }

    async stop() {
        if (this.resample_node) {
            if (this.source) {
                this.source.disconnect(this.resample_node);
            }

            this.resample_node.port.onmessage = null;
            this.resample_node.disconnect();
        }

        this.resample_node = null;
        this.source = null;
        this.removeAllListeners("audio-data");
    }
}
