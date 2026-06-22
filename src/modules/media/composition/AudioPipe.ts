import type { EventEmitter } from "@/modules/shared/EventEmitter";

/**
 * AudioPipe role — wires the microphone into the transport's send path and the
 * received payload back out to the speaker (via AudioContext). Knows nothing
 * about how data crosses the wire (`IConnection`) nor how it surfaces as
 * measurements (`IStatsAdapter`). The `peerMuted` event flows here because it's
 * derived from the audio stream itself (WebRTC mute-track events, or — for
 * UNOFFICIAL — server-pushed `call:peer:muted` routed through Call).
 */

export type PipeEvents = {
    peerMuted: [muted: boolean];
};

export interface IAudioPipe extends EventEmitter<PipeEvents> {
    /**
     * Promise resolves once the speaker-side AnalyserNode is wired into the
     * AudioContext graph. Consumers can probe the analyser for inbound (peer →
     * local speaker) audio visualisations.
     */
    readonly audioAnalyserIn: Promise<AnalyserNode>;
    /**
     * Promise resolves once the microphone-side AnalyserNode is wired into the
     * AudioContext graph. Consumers can probe the analyser for outbound (local
     * mic → peer) audio visualisations. The mic chain is anchored with a silent
     * `GainNode(0) → destination` so the WebAudio graph renders and the
     * AnalyserNode actually receives samples.
     */
    readonly audioAnalyserOut: Promise<AnalyserNode>;
    peerMuted: boolean;
    start(): Promise<void>;
    stop(): Promise<void>;
}
