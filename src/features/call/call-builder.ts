import type { Call, CallActive, CallOffer, CallOutgoing } from "@/features/call/types/call";
import type { DeviceManager } from "@/features/device/device-manager";
import type { CallTransport } from "@/features/device/types/socket";
import type { Multimedia } from "@/features/multimedia/multimedia";
import type { ITransport } from "@/features/multimedia/transport/ITransport";
import { WebRTCTransport } from "@/features/multimedia/transport/webrtc/WebRTCTransport";

export const CallBuilder = {
    buildOffer(call: Call, device: DeviceManager, multimedia: Multimedia): CallOffer {
        const { callbacks: _callbacks, ...rest } = call;

        return {
            ...rest,
            accept: async () => {
                const { transport: config, err } = await device.acceptCall({ call_id: call.id });

                if (!config) {
                    return { call: null, err };
                }

                const transport = await multimedia.startTransport(device.token, config).catch(() => null);

                if (!transport) {
                    return { call: null, err: "TransportError" };
                }

                const _call = await CallBuilder.buildActiveCall(call, device, transport, multimedia);

                if (transport instanceof WebRTCTransport && _call.direction === "INCOMING" && transport.answer) {
                    device.sendSdpAnswer(transport.answer);
                    transport.on("muted", (muted) => {
                        if (muted) {
                            call.callbacks.onPeerMute?.();
                        } else {
                            call.callbacks.onPeerUnmute?.();
                        }
                    });
                }

                return { call: _call, err: null };
            },
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

    async buildOutgoing(
        call: Call,
        device: DeviceManager,
        multimedia: Multimedia,
        transportConfig: CallTransport,
    ): Promise<CallOutgoing> {
        const { callbacks: _callbacks, ...rest } = call;

        const transport = await multimedia.startTransport(device.token, transportConfig);

        return {
            ...rest,
            onStatus: (cb) => {
                call.callbacks.onStatus = cb;
            },
            onPeerAccept: (cb) => {
                call.callbacks.onAccept = () =>
                    CallBuilder.buildActiveCall(call, device, transport, multimedia).then((call) => cb(call));
            },
            onPeerReject: (cb) => {
                call.callbacks.onReject = cb;
            },
            onUnanswered: (cb) => {
                call.callbacks.onUnanswered = cb;
            },
            onEnd: (cb) => {
                call.callbacks.onEnd = () => {
                    transport.stop();
                    cb();
                };
            },
            end: () =>
                device.endCall().then(({ err }) => {
                    if (!err) {
                        call.callbacks.onEnd?.();
                    }

                    return { err };
                }),
            mute: async () => {
                const { err } = await device.mute().then(({ err }) => {
                    if (!err) {
                        call.muted = true;
                    }

                    return { err };
                });

                if (err) return { err };

                const mic = multimedia.microphone.deviceUsed;
                if (mic) {
                    for (const track of mic.stream.getTracks()) {
                        track.enabled = false;
                    }
                }

                return { err: null };
            },
            unmute: async () => {
                const { err } = await device.unMute().then(({ err }) => {
                    if (!err) {
                        call.muted = false;
                    }

                    return { err };
                });

                if (err) return { err };

                const mic = multimedia.microphone.deviceUsed;
                if (mic) {
                    for (const track of mic.stream.getTracks()) {
                        track.enabled = true;
                    }
                }

                return { err: null };
            },
        };
    },

    async buildActiveCall(
        call: Call,
        device: DeviceManager,
        transport: ITransport,
        multimedia: Multimedia,
    ): Promise<CallActive> {
        const { callbacks: _callbacks, ...rest } = call;

        if (transport instanceof WebRTCTransport) {
            transport.on("stats", (stats) => _callbacks.onStats?.(stats));
        }

        return {
            ...rest,
            connection_status: transport.status,
            audio_analyser: transport.audioAnalyser,
            end: () =>
                device.endCall().then(({ err }) => {
                    if (!err) {
                        call.callbacks.onEnd?.();
                        transport.removeAllListeners("status");
                    }

                    return { err };
                }),
            mute: async () => {
                const { err } = await device.mute().then(({ err }) => {
                    if (!err) {
                        call.muted = true;
                    }

                    return { err };
                });

                if (err) return { err };

                const mic = multimedia.microphone.deviceUsed;
                if (mic) {
                    for (const track of mic.stream.getTracks()) {
                        track.enabled = false;
                    }
                }

                return { err: null };
            },
            unmute: async () => {
                const { err } = await device.unMute().then(({ err }) => {
                    if (!err) {
                        call.muted = false;
                    }

                    return { err };
                });

                if (err) return { err };

                const mic = multimedia.microphone.deviceUsed;
                if (mic) {
                    for (const track of mic.stream.getTracks()) {
                        track.enabled = true;
                    }
                }

                return { err: null };
            },
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
                call.callbacks.onEnd = () => {
                    transport.stop();
                    cb();
                };
            },
            onStats: (cb) => {
                call.callbacks.onStats = cb;
            },
            onConnectionStatus: (cb) => {
                transport.on("status", (...args) => cb(...args));
                cb(transport.status);
            },
            onStatus: (cb) => {
                call.callbacks.onStatus = cb;
            },
        };
    },
};
