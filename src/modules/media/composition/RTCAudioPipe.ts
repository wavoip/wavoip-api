import type { MediaManager } from "@/modules/media/MediaManager";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import type { IAudioPipe, PipeEvents } from "./AudioPipe";

/**
 * WebRTC audio pipe role — owns mic acquisition + sender attachment on one
 * side, and the remote-track analyser + peer-mute detection on the other.
 * Knows nothing about SDP, ICE, or stats absorption; it only needs an
 * already-constructed RTCPeerConnection to add senders onto and listen for
 * the inbound `track` event.
 *
 * `ontrack` fires once when the remote stream lands (after SDP negotiation
 * completes). The muted `<audio>` element is a Chromium workaround
 * (issues.chromium.org/issues/40094084): without an HTMLAudioElement holding
 * the MediaStream, the remote track's analyser/destination chain doesn't run.
 *
 * `stop()` is idempotent — both the transport's explicit teardown path and
 * the autonomous `pc.connectionState === "closed"` path call it.
 */
export class RTCAudioPipe extends EventEmitter<PipeEvents> implements IAudioPipe {
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
        private readonly pc: RTCPeerConnection,
        private readonly mediaManager: MediaManager,
    ) {
        super();

        this.analyserInResolver = Promise.withResolvers<AnalyserNode>();
        this.audioAnalyserIn = this.analyserInResolver.promise;
        this.analyserOutResolver = Promise.withResolvers<AnalyserNode>();
        this.audioAnalyserOut = this.analyserOutResolver.promise;

        this.pc.ontrack = (event) => this.handleRemoteTrack(event);
    }

    async start(): Promise<void> {
        if (this.started) return;
        this.started = true;
        const micStream = await this.mediaManager.startMedia();
        for (const track of micStream.getTracks()) {
            track.enabled = !this.mediaManager.muted;
            this.pc.addTrack(track, micStream);
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
        // Mirror WSAudioPipe.AudioInput: mic stream → analyser → silent gain → destination.
        // Mic feeds RTCPeerConnection directly (not the AudioContext graph), so the
        // analyser needs its own source + destination anchor to receive samples.
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

    private handleRemoteTrack(event: RTCTrackEvent): void {
        const remoteStream = event.streams[0];

        // Chromium workaround: anchor the MediaStream in a muted <audio> element
        // so the analyser/destination chain actually receives audio frames.
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
