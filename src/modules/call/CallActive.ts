import type { CallBus } from "@/modules/call/CallBus";
import type { CallPeer } from "@/modules/call/Peer";
import type { CallStats } from "@/modules/call/Stats";
import type { Call, CallDirection, CallStatus, CallType } from "@/modules/device/Call";
import type { ITransport, TransportStatus } from "@/modules/media/ITransport";
import type { MediaManager } from "@/modules/media/MediaManager";

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
    onError(callback: (err: string) => void): void;
    onPeerMute(callback: () => void): void;
    onPeerUnmute(callback: () => void): void;
    onEnd(callback: () => void): void;
    onStats(callback: (stats: CallStats) => void): void;
    onConnectionStatus(callback: (status: TransportStatus) => void): void;
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

        onError(callback: (err: string) => void): void {
            bus.on("failed", (err) => {
                callback(err);
            });
        },

        onPeerMute(callback: () => void): void {
            bus.on("peerMuted", (muted) => {
                if (muted) callback();
            });
        },

        onPeerUnmute(callback: () => void): void {
            bus.on("peerMuted", (muted) => {
                if (!muted) callback();
            });
        },

        onEnd(callback: () => void): void {
            bus.on("ended", callback);
        },

        onStats(callback: (stats: CallStats) => void): void {
            bus.on("stats", callback);
        },

        onConnectionStatus(callback: (status: TransportStatus) => void): void {
            bus.on("connectionStatus", callback);
        },

        onStatus(cb: (status: CallStatus) => void): void {
            bus.on("status", cb);
        },
    };
}
