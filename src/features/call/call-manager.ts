import { CallBuilder } from "@/features/call/call-builder";
import type { Call, CallStats } from "@/features/call/types/call";
import type { DeviceManager } from "@/features/device/device-manager";
import type { CallPeer, CallTransport } from "@/features/device/types/socket";
import type { Multimedia } from "@/features/multimedia/multimedia";

export class CallManager {
    private calls: Map<string, Call>;

    constructor(private readonly multimedia: Multimedia) {
        this.calls = new Map();
    }

    onOffer(id: string, peer: CallPeer, device: DeviceManager) {
        const call: Call = {
            id,
            device_token: device.token,
            direction: "INCOMING",
            status: "RINGING",
            muted: false,
            peer: {
                ...peer,
                muted: false,
            },
            callbacks: {},
        };

        this.calls.set(call.id, call);
        return CallBuilder.buildOffer(call, device, this.multimedia);
    }

    async buildOutgoing(id: string, peer: CallPeer, transport: CallTransport, device: DeviceManager) {
        const call: Call = {
            id,
            device_token: device.token,
            peer: {
                ...peer,
                muted: false,
            },
            direction: "OUTGOING",
            status: "RINGING",
            muted: false,
            callbacks: {},
        };

        this.calls.set(call.id, call);
        return await CallBuilder.buildOutgoing(call, device, this.multimedia, transport);
    }

    getCall(id: string) {
        return this.calls.get(id);
    }

    removeCall(id: string) {
        this.calls.delete(id);
    }

    bindDeviceEvents(device: DeviceManager) {
        device.socket.on("call:status", (call_id, status) => {
            const call = this.calls.get(call_id);
            if (!call) return;

            call.status = status;
            call.callbacks.onStatus?.(status);

            if (status === "ACTIVE") {
                call.callbacks.onAccept?.();
            }

            if (status === "NOT ANSWERED") {
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
                setTimeout(() => {
                    call.callbacks.onEnd?.();
                }, 1000);
            }
        });
    }
}
