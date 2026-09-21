import type { EventEmitter } from "@/modules/shared/EventEmitter";

/**
 * `peerMuted` mora aqui porque, no WebRTC, vem do próprio stream (eventos de mute da
 * track).
 */

export type PipeEvents = {
    peerMuted: [muted: boolean];
};

export interface IAudioPipe extends EventEmitter<PipeEvents> {
    readonly audioAnalyserIn: Promise<AnalyserNode>;
    readonly audioAnalyserOut: Promise<AnalyserNode>;
    peerMuted: boolean;
    start(): Promise<void>;
    stop(): Promise<void>;
}
