import type { Call, CallActive, CallOffer, CallOutgoing } from "@/features/call/types/call";
import type { DeviceManager } from "@/features/device/device-manager";
import type { Multimedia } from "@/features/multimedia/multimedia";

export const CallBuilder = {
    buildOffer(call: Call, device: DeviceManager, multimedia: Multimedia): CallOffer {
        const { callbacks: _callbacks, ...rest } = call;

        return {
            ...rest,
            accept: () =>
                device.acceptCall(call.id).then(({ err }) => {
                    if (err) {
                        return { call: null, err };
                    }

                    return { call: CallBuilder.buildActiveCall(call, device, multimedia), err: null };
                }),
            reject: () =>
                device.rejectCall(call.id).then(({ err }) => {
                    if (!err) {
                        call.callbacks.onEnd?.();
                    }

                    return { err };
                }),
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
            onStatus: (cb) => {
                call.callbacks.onStatus = cb;
            },
        };
    },

    buildOutgoing(call: Call, device: DeviceManager, multimedia: Multimedia): CallOutgoing {
        const { callbacks: _callbacks, ...rest } = call;

        return {
            ...rest,
            onStatus: (cb) => {
                call.callbacks.onStatus = cb;
            },
            onPeerAccept: (cb) => {
                call.callbacks.onAccept = () => cb(CallBuilder.buildActiveCall(call, device, multimedia));
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
            end: () =>
                device.endCall().then(({ err }) => {
                    if (!err) {
                        call.callbacks.onEnd?.();
                    }

                    return { err };
                }),
            mute: () =>
                device.mute().then(({ err }) => {
                    if (!err) {
                        call.muted = true;
                    }

                    return { err };
                }),
            unmute: () =>
                device.unMute().then(({ err }) => {
                    if (!err) {
                        call.muted = false;
                    }

                    return { err };
                }),
        };
    },

    buildActiveCall(call: Call, device: DeviceManager, multimedia: Multimedia): CallActive {
        const { callbacks: _callbacks, ...rest } = call;

        const audioAnalyserPromise = new Promise<AnalyserNode>((resolve) => {
            multimedia.callbacks.onAudioAnalyser = (analyser) => resolve(analyser);
        });

        return {
            ...rest,
            connection_status: multimedia.socket_status,
            audio_analyser: audioAnalyserPromise,
            end: () =>
                device.endCall().then(({ err }) => {
                    if (!err) {
                        call.callbacks.onEnd?.();
                        multimedia.callbacks.onConnectionStatus = undefined;
                    }

                    return { err };
                }),
            mute: () =>
                device.mute().then(({ err }) => {
                    if (!err) {
                        call.muted = true;
                    }

                    return { err };
                }),
            unmute: () =>
                device.unMute().then(({ err }) => {
                    if (!err) {
                        call.muted = false;
                    }

                    return { err };
                }),
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
            onConnectionStatus: (cb) => {
                multimedia.callbacks.onConnectionStatus = cb;
                cb(multimedia.socket_status);
            },
            onStatus: (cb) => {
                call.callbacks.onStatus = cb;
            },
        };
    },
};
