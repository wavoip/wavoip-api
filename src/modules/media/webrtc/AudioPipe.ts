import type { AudioRuntime } from "@/modules/media/ITransport";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import type { AudioHandle, AudioMeter } from "@/ports/runtime/AudioEnginePort";
import type { MediaStreamLike, PeerConnectionLike } from "@/ports/runtime/PeerConnectionPort";

/**
 * `stop()` é idempotente porque dois caminhos o chamam: o desmonte explícito do
 * transporte e o `pc.connectionState === "closed"`.
 */
/** `peerMuted` mora aqui porque, no WebRTC, vem dos eventos de mute da track remota. */
export type PipeEvents = {
    peerMuted: [muted: boolean];
};

export class RTCAudioPipe extends EventEmitter<PipeEvents> {
    peerMuted = false;
    readonly meterIn: Promise<AudioMeter>;
    readonly meterOut: Promise<AudioMeter>;

    private readonly meterInResolver: PromiseWithResolvers<AudioMeter>;
    private readonly meterOutResolver: PromiseWithResolvers<AudioMeter>;
    private micMeter: AudioHandle | null = null;
    private remotePlayback: AudioHandle | null = null;
    private started = false;
    private stopped = false;

    constructor(
        private readonly pc: PeerConnectionLike,
        private readonly audio: AudioRuntime,
    ) {
        super();

        this.meterInResolver = Promise.withResolvers<AudioMeter>();
        this.meterIn = this.meterInResolver.promise;
        this.meterOutResolver = Promise.withResolvers<AudioMeter>();
        this.meterOut = this.meterOutResolver.promise;

        this.pc.addEventListener("track", (event) => this.handleRemoteTrack(event));
    }

    async start(): Promise<void> {
        if (this.started) return;
        this.started = true;
        const micStream = await this.audio.microphone.open();
        for (const track of micStream.getTracks()) {
            track.enabled = !this.audio.microphone.muted;
            this.pc.addTrack(track, micStream);
        }

        // O microfone alimenta o RTCPeerConnection direto, sem passar pelo motor de áudio:
        // medir o que sai pede uma derivação só para isso.
        this.micMeter = this.audio.engine.monitorStream(micStream);
        this.meterOutResolver.resolve(this.micMeter.meter);
    }

    async stop(): Promise<void> {
        if (this.stopped) return;
        this.stopped = true;
        this.micMeter?.stop();
        this.remotePlayback?.stop();
        this.micMeter = null;
        this.remotePlayback = null;
        await this.audio.microphone.close();
    }

    private handleRemoteTrack(event: { streams: readonly MediaStreamLike[] }): void {
        const remoteStream = event.streams[0];

        const remoteTrack = remoteStream.getAudioTracks()[0];
        if (remoteTrack) {
            remoteTrack.addEventListener("mute", () => this.announcePeerMuted(true));
            remoteTrack.addEventListener("unmute", () => this.announcePeerMuted(false));
        }

        this.remotePlayback = this.audio.engine.playStream(remoteStream);
        this.meterInResolver.resolve(this.remotePlayback.meter);
    }

    private announcePeerMuted(muted: boolean): void {
        if (this.peerMuted === muted) return;
        this.peerMuted = muted;
        this.emit("peerMuted", muted);
    }
}
