
import type { MediaRuntime } from "@/modules/media/ITransport";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import type { AudioMeter } from "@/ports/runtime/AudioEnginePort";
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
    /**
     * `null` enquanto a mídia não subiu, ou onde a plataforma não mede — a chamada existe
     * antes de o áudio passar. Quem decide o que mostrar no lugar é o transporte.
     */
    readonly audio: { in: { level(): number | null }; out: { level(): number | null } } = {
        in: { level: () => this.remotePlayback?.level() ?? null },
        out: { level: () => this.micMeter?.level() ?? null },
    };

    private micMeter: AudioMeter | null = null;
    private remotePlayback: AudioMeter | null = null;
    private started = false;
    private stopped = false;

    constructor(
        private readonly pc: PeerConnectionLike,
        private readonly runtime: MediaRuntime,
    ) {
        super();

        this.pc.addEventListener("track", (event) => this.handleRemoteTrack(event));
    }

    async start(): Promise<void> {
        if (this.started) return;
        this.started = true;
        const micStream = await this.runtime.microphone.open();
        for (const track of micStream.getTracks()) {
            track.enabled = !this.runtime.microphone.muted;
            this.pc.addTrack(track, micStream);
        }

        // O microfone alimenta o RTCPeerConnection direto, sem passar pelo motor de áudio:
        // medir o que sai pede uma derivação só para isso.
        this.micMeter = this.runtime.engine.monitorStream(micStream);
    }

    async stop(): Promise<void> {
        if (this.stopped) return;
        this.stopped = true;
        this.micMeter?.stop();
        this.remotePlayback?.stop();
        this.micMeter = null;
        this.remotePlayback = null;
        await this.runtime.microphone.close();
    }

    private handleRemoteTrack(event: { streams: readonly MediaStreamLike[] }): void {
        const remoteStream = event.streams[0];

        const remoteTrack = remoteStream.getAudioTracks()[0];
        if (remoteTrack) {
            remoteTrack.addEventListener("mute", () => this.announcePeerMuted(true));
            remoteTrack.addEventListener("unmute", () => this.announcePeerMuted(false));
        }

        this.remotePlayback = this.runtime.engine.renderRemote(remoteStream);
    }

    private announcePeerMuted(muted: boolean): void {
        if (this.peerMuted === muted) return;
        this.peerMuted = muted;
        this.emit("peerMuted", muted);
    }
}
