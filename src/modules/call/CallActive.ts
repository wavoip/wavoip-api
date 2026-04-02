import type { CallBus } from "@/modules/call/CallBus";
import type { CallPeer } from "@/modules/call/Peer";
import type { CallStats } from "@/modules/call/Stats";
import type { Call, CallDirection, CallStatus, CallType } from "@/modules/device/Call";
import type { ITransport, TransportStatus } from "@/modules/media/ITransport";
import type { MediaManager } from "@/modules/media/MediaManager";
import { EventEmitter, type Unsubscribe } from "@/modules/shared/EventEmitter";

export type CallActiveEvents = {
    error: [err: string];
    peerMute: [];
    peerUnmute: [];
    ended: [];
    stats: [stats: CallStats];
    connectionStatus: [status: TransportStatus];
    status: [status: CallStatus];
};

export interface CallActive {
    id: string;
    type: CallType;
    direction: CallDirection;
    peer: CallPeer;
    device_token: string;
    status: CallStatus;
    connection_status: TransportStatus;
    audio_analyser: Promise<AnalyserNode>;
    mute(): Promise<{ err: string | null }>;
    unmute(): Promise<{ err: string | null }>;
    end(): Promise<{ err: string | null }>;
    on<T extends keyof CallActiveEvents>(event: T, callback: (...args: CallActiveEvents[T]) => void): Unsubscribe;
    /** @deprecated Use `on("error", callback)` instead. */
    onError(callback: (err: string) => void): void;
    /** @deprecated Use `on("peerMute", callback)` instead. */
    onPeerMute(callback: () => void): void;
    /** @deprecated Use `on("peerUnmute", callback)` instead. */
    onPeerUnmute(callback: () => void): void;
    /** @deprecated Use `on("ended", callback)` instead. */
    onEnd(callback: () => void): void;
    /** @deprecated Use `on("stats", callback)` instead. */
    onStats(callback: (stats: CallStats) => void): void;
    /** @deprecated Use `on("connectionStatus", callback)` instead. */
    onConnectionStatus(callback: (status: TransportStatus) => void): void;
    /** @deprecated Use `on("status", callback)` instead. */
    onStatus(cb: (status: CallStatus) => void): void;
}

export function CallActiveProxy(
    call: Call,
    bus: CallBus,
    transport: ITransport,
    mediaManager: MediaManager,
    callbacks: {
        onEnd: (call: Call) => void;
    },
): CallActive {
    const emitter = new EventEmitter<CallActiveEvents>();

    bus.on("failed", (err) => emitter.emit("error", err));
    bus.on("peerMuted", (muted) => {
        if (muted) emitter.emit("peerMute");
        else emitter.emit("peerUnmute");
    });
    bus.on("ended", () => emitter.emit("ended"));
    bus.on("stats", (stats) => emitter.emit("stats", stats));
    bus.on("connectionStatus", (status) => emitter.emit("connectionStatus", status));
    bus.on("status", (status) => emitter.emit("status", status));

    let onErrorUnsub: Unsubscribe | undefined;
    let onPeerMuteUnsub: Unsubscribe | undefined;
    let onPeerUnmuteUnsub: Unsubscribe | undefined;
    let onEndUnsub: Unsubscribe | undefined;
    let onStatsUnsub: Unsubscribe | undefined;
    let onConnectionStatusUnsub: Unsubscribe | undefined;
    let onStatusUnsub: Unsubscribe | undefined;

    return {
        id: call.id,
        type: call.type,
        device_token: call.deviceToken,
        direction: call.direction,
        status: call.status,
        peer: { ...call.peer, muted: transport.peerMuted },
        connection_status: transport.status,
        audio_analyser: transport.audioAnalyser,

        mute(): Promise<{ err: string | null }> {
            mediaManager.setMuted(true);
            return Promise.resolve({ err: null });
        },

        unmute(): Promise<{ err: string | null }> {
            mediaManager.setMuted(false);
            return Promise.resolve({ err: null });
        },

        async end(): Promise<{ err: string | null }> {
            callbacks.onEnd(call);
            await transport.stop();
            return { err: null };
        },

        on<T extends keyof CallActiveEvents>(event: T, callback: (...args: CallActiveEvents[T]) => void): Unsubscribe {
            return emitter.on(event, callback);
        },

        /** @deprecated Use `on("error", callback)` instead. */
        onError(callback: (err: string) => void): void {
            onErrorUnsub?.();
            onErrorUnsub = emitter.on("error", callback);
        },

        /** @deprecated Use `on("peerMute", callback)` instead. */
        onPeerMute(callback: () => void): void {
            onPeerMuteUnsub?.();
            onPeerMuteUnsub = emitter.on("peerMute", callback);
        },

        /** @deprecated Use `on("peerUnmute", callback)` instead. */
        onPeerUnmute(callback: () => void): void {
            onPeerUnmuteUnsub?.();
            onPeerUnmuteUnsub = emitter.on("peerUnmute", callback);
        },

        /** @deprecated Use `on("ended", callback)` instead. */
        onEnd(callback: () => void): void {
            onEndUnsub?.();
            onEndUnsub = emitter.on("ended", callback);
        },

        /** @deprecated Use `on("stats", callback)` instead. */
        onStats(callback: (stats: CallStats) => void): void {
            onStatsUnsub?.();
            onStatsUnsub = emitter.on("stats", callback);
        },

        /** @deprecated Use `on("connectionStatus", callback)` instead. */
        onConnectionStatus(callback: (status: TransportStatus) => void): void {
            onConnectionStatusUnsub?.();
            onConnectionStatusUnsub = emitter.on("connectionStatus", callback);
        },

        /** @deprecated Use `on("status", callback)` instead. */
        onStatus(cb: (status: CallStatus) => void): void {
            onStatusUnsub?.();
            onStatusUnsub = emitter.on("status", cb);
        },
    };
}
