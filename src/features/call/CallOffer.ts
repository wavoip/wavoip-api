import { CallActive } from "@/features/call/CallActive";
import type { DeviceManager } from "../device/device-manager";
import type { Multimedia } from "../multimedia/multimedia";
import type { Call, CallStatus, CallOffer as TOffer, CallActive as TActive } from "./types/call";

export function CallOffer(call: Call, device: DeviceManager, multimedia: Multimedia): TOffer {
    const { callbacks: _, ...rest } = call;

    return {
        ...rest,
        async accept(): Promise<{ call: TActive; err: null } | { call: null; err: string }> {
            const { err: multimediaErr } = await multimedia.canCall();
            if (multimediaErr) {
                return { call: null, err: multimediaErr.toString() };
            }

            const { transport: config, err } = await device.acceptCall({ call_id: call.id });

            if (!config) {
                return { call: null, err };
            }

            const transport = await multimedia.startTransport(device.token, config).catch(() => null);

            if (!transport) {
                await device.endCall();
                return { call: null, err: "TransportError" };
            }

            const callActive = CallActive(call, device, multimedia, transport);

            return { call: callActive, err: null };
        },

        async reject(): Promise<{ err: string | null }> {
            const { err } = await device.rejectCall(call.id);

            if (!err) {
                call.callbacks.onReject?.();
                call.callbacks.onEnd?.();
            }

            return { err };
        },

        onAcceptedElsewhere(cb: () => void) {
            call.callbacks.onAcceptedElsewhere = cb;
        },

        onRejectedElsewhere(cb: () => void) {
            call.callbacks.onRejectedElsewhere = cb;
        },

        onUnanswered(cb: () => void) {
            call.callbacks.onUnanswered = cb;
        },

        onEnd(cb: () => void) {
            call.callbacks.onEnd = cb;
        },

        onStatus(cb: (status: CallStatus) => void) {
            call.callbacks.onStatus = cb;
        },
    };
}
