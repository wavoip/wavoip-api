import type { MediaManager } from "@/modules/media/MediaManager";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import type { MediaStreamLike, MediaTrackLike, PeerConnectionLike } from "@/ports/runtime/PeerConnectionPort";

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
    readonly audioAnalyserIn: Promise<AnalyserNode>;
    readonly audioAnalyserOut: Promise<AnalyserNode>;

    private readonly analyserInResolver: PromiseWithResolvers<AnalyserNode>;
    private readonly analyserOutResolver: PromiseWithResolvers<AnalyserNode>;
    private txSource: MediaStreamAudioSourceNode | null = null;
    private txAnalyser: AnalyserNode | null = null;
    private txSilentGain: GainNode | null = null;
    private started = false;
    private stopped = false;

    constructor(
        private readonly pc: PeerConnectionLike,
        private readonly mediaManager: MediaManager,
    ) {
        super();

        this.analyserInResolver = Promise.withResolvers<AnalyserNode>();
        this.audioAnalyserIn = this.analyserInResolver.promise;
        this.analyserOutResolver = Promise.withResolvers<AnalyserNode>();
        this.audioAnalyserOut = this.analyserOutResolver.promise;

        this.pc.addEventListener("track", (event) => this.handleRemoteTrack(event));
    }

    async start(): Promise<void> {
        if (this.started) return;
        this.started = true;
        const micStream = await this.mediaManager.startMedia();
        for (const track of micStream.getTracks()) {
            track.enabled = !this.mediaManager.muted;
            this.pc.addTrack(track as unknown as MediaTrackLike, micStream as unknown as MediaStreamLike);
        }
        this.wireTxAnalyser(micStream);
    }

    async stop(): Promise<void> {
        if (this.stopped) return;
        this.stopped = true;
        if (this.txSource && this.txAnalyser) this.txSource.disconnect(this.txAnalyser);
        this.txAnalyser?.disconnect();
        this.txSilentGain?.disconnect();
        this.txSource = null;
        this.txAnalyser = null;
        this.txSilentGain = null;
        await this.mediaManager.stopMedia();
    }

    private wireTxAnalyser(micStream: MediaStream): void {
        // O microfone alimenta o RTCPeerConnection direto, fora do grafo do AudioContext;
        // o analyser precisa de fonte própria e de âncora no destination (ver WSAudioPipe).
        const ctx = this.mediaManager.audioContext;
        this.txSource = ctx.createMediaStreamSource(micStream);
        this.txAnalyser = ctx.createAnalyser();
        this.txAnalyser.fftSize = 256;
        this.txSilentGain = ctx.createGain();
        this.txSilentGain.gain.value = 0;
        this.txSource.connect(this.txAnalyser);
        this.txAnalyser.connect(this.txSilentGain);
        this.txSilentGain.connect(ctx.destination);
        this.analyserOutResolver.resolve(this.txAnalyser);
    }

    private handleRemoteTrack(event: { streams: readonly MediaStreamLike[] }): void {
        const remoteStream = event.streams[0] as unknown as MediaStream;

        // Bug do Chromium (issues.chromium.org/issues/40094084): sem um HTMLAudioElement
        // segurando o MediaStream, a cadeia analyser/destination da track remota não recebe
        // áudio. O elemento fica mudo.
        const audio = new Audio();
        audio.muted = true;
        audio.srcObject = remoteStream;

        const remoteTrack = remoteStream.getAudioTracks()[0];
        if (remoteTrack) {
            remoteTrack.addEventListener("mute", () => {
                if (this.peerMuted) return;
                this.peerMuted = true;
                this.emit("peerMuted", true);
            });
            remoteTrack.addEventListener("unmute", () => {
                if (!this.peerMuted) return;
                this.peerMuted = false;
                this.emit("peerMuted", false);
            });
        }

        const ctx = this.mediaManager.audioContext;
        const source = ctx.createMediaStreamSource(remoteStream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;

        source.connect(analyser);
        analyser.connect(ctx.destination);

        this.analyserInResolver.resolve(analyser);
    }
}
