import type { MicError } from "@/features/multimedia/microphone/types/error";
import type { MultimediaDevice } from "@/features/multimedia/types/multimedia-device";

export class Microphone {
    private audio_context: AudioContext | null;
    private mic_stream: MediaStream | null;
    private mic_source: MediaStreamAudioSourceNode | null;
    private resample_node: AudioWorkletNode | null;

    private onError: (err: MicError) => void;
    private playback_active: boolean;

    public devices: MultimediaDevice[];

    constructor(params: { onError(err: MicError): void }) {
        this.audio_context = null;
        this.mic_stream = null;
        this.mic_source = null;
        this.resample_node = null;
        this.devices = [];
        this.onError = params.onError;
        this.playback_active = false;

        this.requestMicPermission().then(({ stream, err }) => {
            if (!stream) {
                this.onError(err);
            }
        });
    }

    async start(socket: WebSocket) {
        const { stream, err } = await this.requestMicPermission();

        if (!stream) {
            this.onError(err);
            return;
        }

        try {
            this.audio_context = new AudioContext({ latencyHint: "interactive" });
        } catch (err) {
            this.onError((err as Error).name as MicError);
            return;
        }

        await this.audio_context.audioWorklet.addModule(new URL("./AudioWorkletMic.js", import.meta.url));

        this.resample_node = new AudioWorkletNode(this.audio_context, "resample-processor", {
            processorOptions: { sampleRate: this.audio_context.sampleRate },
        });

        this.resample_node.port.onmessage = (event) => {
            if (socket.readyState !== 1) {
                return;
            }
            socket.send(event.data);
        };

        this.mic_stream = stream;
        this.mic_source = this.audio_context.createMediaStreamSource(this.mic_stream);
        this.mic_source.connect(this.resample_node);
    }

    async stop() {
        if (this.mic_stream) {
            for (const track of this.mic_stream.getTracks()) {
                track.stop();
            }
            this.mic_stream = null;
        }

        if (this.resample_node) {
            this.resample_node.disconnect();
            this.resample_node = null;
            this.playback_active = false;
        }

        if (this.audio_context?.state !== "closed") {
            this.audio_context?.close();
        }
    }

    async requestMicPermission() {
        return navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then((stream) => ({ stream, err: null }))
            .catch((err: Error) => {
                return { stream: null, err: err.name as MicError };
            });
    }

    togglePlayback() {
        if (this.playback_active) {
            this.resample_node?.disconnect();
            this.playback_active = true;
        } else {
            if (this.audio_context) {
                this.resample_node?.connect(this.audio_context.destination);
            }
            this.playback_active = false;
        }
    }

    async changeDevice(deviceId: string) {
        if (!this.audio_context || !this.resample_node) {
            return { err: "NotAllowedError" };
        }

        const { stream, err } = await navigator.mediaDevices
            .getUserMedia({ audio: { deviceId } })
            .then((stream) => ({ stream, err: null }))
            .catch((err: Error) => ({ stream: null, err: err.name as MicError }));

        if (!stream) {
            return { err };
        }

        if (this.mic_stream) {
            for (const track of this.mic_stream.getTracks()) {
                track.stop();
            }
        }

        this.mic_stream = stream;
        this.mic_source = this.audio_context.createMediaStreamSource(this.mic_stream);
        this.mic_source.connect(this.resample_node);
    }
}
