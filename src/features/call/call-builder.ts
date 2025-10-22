import type { Call, CallActive, CallOffer, CallOutgoing } from "@/features/call/types/call";
import type { DeviceManager } from "@/features/device/device-manager";
import type { CallTransport } from "@/features/device/types/socket";
import type { Multimedia } from "@/features/multimedia/multimedia";

export const CallBuilder = {
    buildOffer(call: Call, device: DeviceManager, multimedia: Multimedia): CallOffer {
        const { callbacks: _callbacks, ...rest } = call;

        return {
            ...rest,
            accept: () =>
                device.acceptCall({ call_id: call.id }).then(({ transport, err }) => {
                    if (!transport) {
                        return { call: null, err };
                    }

                    const _call = CallBuilder.buildActiveCall(call, device, multimedia, transport);

                    return { call: _call, err: null };
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

    buildOutgoing(call: Call, device: DeviceManager, multimedia: Multimedia, transport: CallTransport): CallOutgoing {
        const { callbacks: _callbacks, ...rest } = call;

        return {
            ...rest,
            onStatus: (cb) => {
                call.callbacks.onStatus = cb;
            },
            onPeerAccept: (cb) => {
                call.callbacks.onAccept = () => cb(CallBuilder.buildActiveCall(call, device, multimedia, transport));
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

    buildActiveCall(call: Call, device: DeviceManager, multimedia: Multimedia, transport: CallTransport): CallActive {
        const { callbacks: _callbacks, ...rest } = call;

        const audioAnalyserPromise = new Promise<AnalyserNode>((resolve) => {
            multimedia.on("audioAnalyser", (analyser) => resolve(analyser));
        });

        multimedia.start(device.token, transport);

        return {
            ...rest,
            connection_status: multimedia.socket_status,
            audio_analyser: audioAnalyserPromise,
            end: () =>
                device.endCall().then(({ err }) => {
                    if (!err) {
                        call.callbacks.onEnd?.();
                        multimedia.removeAllListeners("status");
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
                multimedia.on("status", (...args) => cb(...args));
                cb(multimedia.socket_status);
            },
            onStatus: (cb) => {
                call.callbacks.onStatus = cb;
            },
        };
    },
};
