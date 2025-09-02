import type { Call, CallActive, CallOffer, CallOutgoing } from "@/features/call/types/call";
import type { DeviceManager } from "@/features/device/device-manager";

export const CallBuilder = {
    buildOffer(call: Call, device: DeviceManager): CallOffer {
        const { callbacks: _callbacks, ...rest } = call;

        return {
            ...rest,
            accept: () => device.acceptCall(call.id).then(() => CallBuilder.buildActiveCall(call, device)),
            reject: () => device.rejectCall(call.id),
            onAcceptedElsewhere: (cb) => {
                call.callbacks.onAcceptedElsewhere = cb;
            },
            onRejectedElsewhere: (cb) => {
                call.callbacks.onRejectedElsewhere = cb;
            },
            onUnanswered: (cb) => {
                call.callbacks.onUnanswered = cb;
            },
            onEnd: (cb) => {
                call.callbacks.onEnd = cb;
            },
        };
    },

    buildOutgoing(call: Call, device: DeviceManager): CallOutgoing {
        const { callbacks: _callbacks, ...rest } = call;

        return {
            ...rest,
            onPeerAccept: (cb) => {
                call.callbacks.onAccept = () => cb(CallBuilder.buildActiveCall(call, device));
            },
            onPeerReject: (cb) => {
                call.callbacks.onReject = cb;
            },
            onUnanswered: (cb) => {
                call.callbacks.onUnanswered = cb;
            },
            onEnd: (cb) => {
                call.callbacks.onEnd = cb;
            },
            end: () => device.endCall(),
            mute: () => device.mute(),
            unmute: () => device.unMute(),
        };
    },

    buildActiveCall(call: Call, device: DeviceManager): CallActive {
        const { callbacks: _callbacks, ...rest } = call;

        return {
            ...rest,
            end: () => device.endCall(),
            mute: () => device.mute(),
            unmute: () => device.unMute(),
            onError: (cb) => {
                call.callbacks.onError = cb;
            },
            onPeerMute: (cb) => {
                call.callbacks.onPeerMute = cb;
            },
            onPeerUnmute: (cb) => {
                call.callbacks.onPeerUnmute = cb;
            },
            onEnd: (cb) => {
                call.callbacks.onEnd = cb;
            },
            onStats: (cb) => {
                call.callbacks.onStats = cb;
            },
        };
    },
};
