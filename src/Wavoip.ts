import { CallBuilder } from "@/features/call/call-builder";
import type { Call, CallOffer, CallOutgoing } from "@/features/call/types/call";
import { DeviceManager } from "@/features/device/device-manager";
import { PublicDeviceBuilder } from "@/features/device/PublicDeviceBuilder";
import type { Device } from "@/features/device/types/device";
import { Multimedia } from "@/features/multimedia/multimedia";
import type { MultimediaError } from "@/features/multimedia/types/error";

export class Wavoip {
    private calls: Map<string, Call>;
    private devices: DeviceManager[];
    private multimedia: Multimedia;

    private callbacks: {
        onOffer?: (callOffer: CallOffer) => void;
        onMultimediaError?: (err: MultimediaError) => void;
    };

    constructor(params: {
        tokens: string[];
    }) {
        this.calls = new Map<string, Call>();
        this.devices = [...new Set(params.tokens)].map((token) => new DeviceManager(token));
        this.callbacks = {};
        this.multimedia = new Multimedia();

        this.multimedia.on("error", (error) => this.callbacks.onMultimediaError?.(error));

        for (const device of this.devices) {
            this.bindDeviceEvents(device);
        }
    }

    onOffer(cb: (callOffer: CallOffer) => void) {
        this.callbacks.onOffer = cb;
    }

    onMultimediaError(cb: (err: MultimediaError) => void) {
        this.callbacks.onMultimediaError = cb;
    }

    async startCall(params: {
        fromTokens?: string[];
        to: string;
    }): Promise<
        | { call: CallOutgoing; err: null }
        | { call: null; err: { message: string; devices: { token: string; reason: string }[] } }
    > {
        const devices = params.fromTokens
            ? this.devices.filter((device) => params.fromTokens?.includes(device.token))
            : this.devices;

        if (!devices.length) {
            return { call: null, err: { devices: [], message: "Não existe nenhum dispositivo" } };
        }

        const device_errors: { token: string; reason: string }[] = [];

        for (const device of devices) {
            const canCall = device.canCall();

            if (canCall.err) {
                device_errors.push({ token: device.token, reason: canCall.err });
                continue;
            }

            const { call: callStarted, err } = await device.startCall(params.to);

            if (!callStarted) {
                device_errors.push({ token: device.token, reason: err as string });
                continue;
            }

            const call: Call = {
                id: callStarted.id,
                device_token: device.token,
                peer: {
                    ...callStarted.peer,
                    muted: false,
                },
                direction: "OUTGOING",
                status: "RINGING",
                muted: false,
                callbacks: {},
            };

            this.calls.set(call.id, call);
            return { call: CallBuilder.buildOutgoing(call, device, this.multimedia, callStarted.transport), err: null };
        }

        return { call: null, err: { message: "Não foi possível realizar a chamada", devices: device_errors } };
    }

    getDevices(): Device[] {
        return this.devices.map(PublicDeviceBuilder);
    }

    addDevices(tokens: string[] = []): Device[] {
        const devices = [];
        for (const token of tokens) {
            if (this.devices.find((device) => tokens.includes(device.token))) {
                continue;
            }
            const device = new DeviceManager(token);
            this.devices.push(device);
            devices.push(device);
        }

        return devices.map(PublicDeviceBuilder);
    }

    removeDevices(tokens: string[] = []) {
        const devices = this.devices.filter((device) => tokens.includes(device.token));

        for (const device of devices) {
            device.socket?.close();
        }

        if (devices.length) {
            this.devices.filter((device) => tokens.includes(device.token));
        }

        return this.getDevices();
    }

    wakeUpDevices(tokens: string[] = []) {
        const devices = tokens.length ? this.devices.filter((device) => tokens.includes(device.token)) : this.devices;

        return devices.map((device) => device.getInfos().then((infos) => ({ token: device.token, waken: !!infos })));
    }

    getMultimediaDevices() {
        const microphones = this.multimedia.microphone.devices;
        const speakers = this.multimedia.audio.devices;

        return { microphones, speakers };
    }

    requestMicrophonePermission() {
        this.multimedia.microphone.requestMicPermission();
    }

    private bindDeviceEvents(device: DeviceManager) {
        device.socket.on("call:offer", (_call) => {
            const call: Call = {
                id: _call.id,
                device_token: device.token,
                direction: "INCOMING",
                status: "RINGING",
                muted: false,
                peer: {
                    ..._call.peer,
                    muted: false,
                },
                callbacks: {},
            };

            this.calls.set(call.id, call);
            this.callbacks.onOffer?.(CallBuilder.buildOffer(call, device, this.multimedia));
        });

        device.socket.on("call:signaling", (packet, call_id) => {
            const call = this.calls.get(call_id);

            if (!call) {
                return;
            }

            if (packet.tag === "accept") {
                call.status = "ACTIVE";
                call.callbacks.onAccept?.();
            }

            if (packet.tag === "reject") {
                call.callbacks.onReject?.();
                call.callbacks.onEnd?.();
                this.calls.delete(call.id);
            }

            if (packet.tag === "terminate") {
                if (call.status !== "ACTIVE") {
                    call.callbacks.onUnanswered?.();
                }
                call.callbacks.onEnd?.();
                this.calls.delete(call.id);
            }

            if (packet.tag === "mute_v2") {
                if (packet.attrs["mute-state"] === "0") {
                    call.peer.muted = false;
                    call.callbacks.onPeerUnmute?.();
                } else {
                    call.peer.muted = true;
                    call.callbacks.onPeerMute?.();
                }
            }
        });

        device.socket.on("peer:accepted_elsewhere", (call_id) => {
            const call = this.calls.get(call_id);

            if (!call) {
                return;
            }

            call.callbacks.onAcceptedElsewhere?.();
            call.callbacks.onEnd?.();
            this.calls.delete(call_id);
        });

        device.socket.on("peer:rejected_elsewhere", (call_id) => {
            const call = this.calls.get(call_id);

            if (!call) {
                return;
            }

            call.callbacks.onAcceptedElsewhere?.();
            call.callbacks.onEnd?.();
            this.calls.delete(call_id);
        });

        device.socket.on("call:stats", (call_id, stats) => {
            const call = this.calls.get(call_id);

            if (!call) {
                return;
            }

            call.callbacks.onStats?.(stats);
        });

        device.socket.on("call:error", (call_id, err) => {
            const call = this.calls.get(call_id);

            if (!call) {
                return;
            }

            call.status = "FAILED";
            call.callbacks.onError?.(err);
            call.callbacks.onEnd?.();
            this.calls.delete(call.id);
        });

        device.socket.on("call:status", (call_id, status) => {
            const call = this.calls.get(call_id);

            if (!call) {
                return;
            }

            call.status = status;
            call.callbacks.onStatus?.(status);
        });

        device.socket.on("disconnect", () => {
            if (!device.socket.active) {
                return;
            }

            const call = [...this.calls.values()].find(
                (call) => call.status === "ACTIVE" && call.device_token === device.token,
            );

            if (!call) {
                return;
            }

            device.socket.auth = { call_id: call.id };
            device.socket.connect();
        });
    }
}
