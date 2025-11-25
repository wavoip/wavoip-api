export class AudioOutput {
    public playback_node: AudioWorkletNode | null;
    public analyser_node: AnalyserNode | null;
    public ready: Promise<void>;

    constructor(private readonly audio_context: AudioContext) {
        this.analyser_node = null;
        this.playback_node = null;

        this.ready = new Promise<void>((resolve) => {
            this.audio_context.audioWorklet
                .addModule(new URL("./AudioWorklet.js", import.meta.url))
                .then(() => resolve());
        });
    }

    async start() {
        if (this.audio_context.state !== "running") {
            await this.audio_context.resume();
        }

        this.playback_node = new AudioWorkletNode(this.audio_context, "audio-data-worklet-stream", {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            channelCount: 1,
            processorOptions: {
                offset: 0,
            },
        });

        this.playback_node.connect(this.audio_context.destination);
    }

    createAnalyserNode() {
        const analyser_node = this.audio_context.createAnalyser();
        this.playback_node?.connect(analyser_node);
        analyser_node.fftSize = 256;

        this.analyser_node = analyser_node;

        return analyser_node;
    }

    sendAudioData(data: ArrayBufferLike) {
        this.playback_node?.port.postMessage({
            buffer: new Uint8Array(data),
        });
    }

    async stop() {
        this.playback_node?.port.postMessage({ type: "clear", buffer: [] });
        this.playback_node?.disconnect();
        this.playback_node = null;

        this.analyser_node?.disconnect();
        this.analyser_node = null;
    }
}
