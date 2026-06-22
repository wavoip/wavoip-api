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
    readonly audioAnalyser: Promise<AnalyserNode>;

    private readonly analyserResolver: PromiseWithResolvers<AnalyserNode>;
    private started = false;
    private stopped = false;

    constructor(
        private readonly pc: RTCPeerConnection,
        private readonly mediaManager: MediaManager,
    ) {
        super();

        this.analyserResolver = Promise.withResolvers<AnalyserNode>();
        this.audioAnalyser = this.analyserResolver.promise;

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
    }

    async stop(): Promise<void> {
        if (this.stopped) return;
        this.stopped = true;
        await this.mediaManager.stopMedia();
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

        this.analyserResolver.resolve(analyser);
    }
}
