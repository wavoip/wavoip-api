import type { DeviceManager } from "../device/device-manager";
import type { Multimedia } from "../multimedia/multimedia";
import type { ITransport } from "../multimedia/transport/ITransport";
import { CallActive } from "./CallActive";
import type { Call, CallStatus, CallActive as TActive } from "./types/call";

export function CallOutgoing(call: Call, device: DeviceManager, multimedia: Multimedia, transport: ITransport) {
    const { callbacks: _, ...rest } = call;

    function onAccept() {
        return CallActive(call, device, multimedia, transport);
    }

    function onEnd() {
        transport.stop();
    }

    call.callbacks.onAccept = onAccept;
    call.callbacks.onEnd = onEnd;

    return {
        ...rest,

        async end() {
            const { err } = await device.endCall();

            if (!err) {
                call.callbacks.onEnd?.();
            }

            return { err };
        },

        async mute() {
            const { err } = await device.mute();

            if (err) return { err };

            call.muted = true;

            const mic = multimedia.microphone.deviceUsed;
            if (mic) {
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
            if (mic) {
                for (const track of mic.stream.getTracks()) {
                    track.enabled = true;
                }
            }

            return { err: null };
        },

        onStatus(cb: (status: CallStatus) => void) {
            call.callbacks.onStatus = cb;
        },

        onPeerAccept(cb: (call: TActive) => void) {
            call.callbacks.onAccept = () => cb(onAccept());
        },

        onPeerReject(cb: () => void) {
            call.callbacks.onReject = cb;
        },

        onUnanswered(cb: () => void) {
            call.callbacks.onUnanswered = cb;
        },

        onEnd(cb: () => void) {
            call.callbacks.onEnd = () => {
                onEnd();
                cb();
            };
        },
    };
}
