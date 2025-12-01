import type { Call, CallPeer, CallStats, CallTransport, CallType } from "@/features/call/types/call";
import type { DeviceManager } from "@/features/device/device-manager";
import type { Multimedia } from "@/features/multimedia/multimedia";
import { CallOffer } from "./CallOffer";
import { CallOutgoing } from "./CallOutgoing";

export class CallManager {
    private calls: Map<string, Call>;

    constructor(private readonly multimedia: Multimedia) {
        this.calls = new Map();
    }

    buildOffer(call: { id: string; peer: CallPeer; type: CallType }, device: DeviceManager) {
        const _call: Call = {
            id: call.id,
            type: call.type,
            device_token: device.token,
            direction: "INCOMING",
            status: "RINGING",
            muted: false,
            peer: {
                ...call.peer,
                muted: false,
            },
            callbacks: {},
        };

        this.calls.set(_call.id, _call);

        return CallOffer(_call, device, this.multimedia);
    }

    async buildOutgoing(
        call: { id: string; peer: CallPeer; type: CallType; transport: CallTransport },
        device: DeviceManager,
    ) {
        const transport = await this.multimedia.startTransport(device.token, call.transport);

        const _call: Call = {
            id: call.id,
            type: call.type,
            device_token: device.token,
            peer: {
                ...call.peer,
                muted: false,
            },
            direction: "OUTGOING",
            status: "RINGING",
            muted: false,
            callbacks: {},
        };

        this.calls.set(_call.id, _call);

        return CallOutgoing(_call, device, this.multimedia, transport);
    }

    bindDeviceEvents(device: DeviceManager) {
        device.socket.on("call:status", (call_id, status) => {
            console.log("status", status);
            const call = this.calls.get(call_id);
            console.log({ call });
            if (!call) return;

            call.status = status;
            call.callbacks.onStatus?.(status);

            if (status === "ACTIVE") {
                call.callbacks.onAccept?.();
            }

            if (status === "NOT_ANSWERED") {
                console.log("calling not answered callback");
                call.callbacks.onUnanswered?.();
                call.callbacks.onEnd?.();
                this.calls.delete(call.id);
            }

            if (status === "REJECTED") {
                call.callbacks.onReject?.();
                call.callbacks.onEnd?.();
                this.calls.delete(call.id);
            }

            if (status === "ENDED") {
                call.callbacks.onEnd?.();
                this.calls.delete(call.id);
            }
        });

        device.socket.on("peer:mute", (call_id, muted) => {
            const call = this.calls.get(call_id);
            if (!call) return;

            call.peer.muted = muted;

            if (muted) {
                call.callbacks.onPeerMute?.();
            } else {
                call.callbacks.onPeerUnmute?.();
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

            const callStats: CallStats = {
                rtt: {
                    avg: stats.rtt.client.avg + stats.rtt.whatsapp.avg,
                    min: stats.rtt.client.min + stats.rtt.whatsapp.min,
                    max: stats.rtt.client.max + stats.rtt.whatsapp.max,
                },
                rx: stats.rx,
                tx: stats.tx,
            };

            call.callbacks.onStats?.(callStats);
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

        device.socket.on("disconnect", () => {
            if (!device.socket.active) {
                return;
            }

            for (const call of this.calls.values()) {
                call.callbacks.onStatus?.("DISCONNECTED");
                call.callbacks.onEnd?.();
                this.calls.delete(call.id);
            }
        });
    }
}
