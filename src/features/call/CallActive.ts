import type { DeviceManager } from "../device/device-manager";
import type { Multimedia } from "../multimedia/multimedia";
import type { ITransport, TransportStatus } from "../multimedia/transport/ITransport";
import { WebRTCTransport } from "../multimedia/transport/webrtc/WebRTCTransport";
import type { Call, CallStats, CallStatus, CallActive as TActive } from "./types/call";

export function CallActive(call: Call, device: DeviceManager, multimedia: Multimedia, transport: ITransport): TActive {
    const { callbacks: _, ...rest } = call;

    call.callbacks.onEnd = () => {
        transport.stop();
    };

    if (transport instanceof WebRTCTransport) {
        transport.on("stats", (stats) => call.callbacks.onStats?.(stats));

        if (transport.answer) {
            device.sendSdpAnswer(transport.answer);
            transport.on("muted", (muted) => {
                if (muted) {
                    call.callbacks.onPeerMute?.();
                } else {
                    call.callbacks.onPeerUnmute?.();
                }
            });
        }
    }

    return {
        ...rest,
        connection_status: transport.status,
        audio_analyser: transport.audioAnalyser,
        async end() {
            const { err } = await device.endCall();

            if (!err) {
                call.callbacks.onEnd?.();
                transport.removeAllListeners("status");
            }

            return { err };
        },

        async mute() {
            const { err } = await device.mute();

            if (err) return { err };

            call.muted = true;

            const mic = multimedia.microphone.deviceUsed;
            if (mic?.stream) {
                for (const track of mic.stream.getTracks()) {
                    track.enabled = false;
                }
            }

            return { err: null };
        },

        async unmute() {
            const { err } = await device.unMute();

            if (err) return { err };

            call.muted = false;
            const mic = multimedia.microphone.deviceUsed;
            if (mic?.stream) {
                for (const track of mic.stream.getTracks()) {
                    track.enabled = true;
                }
            }

            return { err: null };
        },

        onError(cb: (err: string) => void) {
            call.callbacks.onError = cb;
        },

        onPeerMute(cb: () => void) {
            call.callbacks.onPeerMute = cb;
        },

        onPeerUnmute(cb: () => void) {
            call.callbacks.onPeerUnmute = cb;
        },

        onEnd(cb: () => void) {
            call.callbacks.onEnd = () => {
                transport.stop();
                cb();
            };
        },

        onStats(cb: (stats: CallStats) => void) {
            call.callbacks.onStats = cb;
        },

        onConnectionStatus(cb: (status: TransportStatus) => void) {
            transport.removeAllListeners("status");
            transport.on("status", (...args) => {
                cb(...args);
            });
            cb(transport.status);
        },

        onStatus(cb: (status: CallStatus) => void) {
            call.callbacks.onStatus = cb;
        },
    };
}
