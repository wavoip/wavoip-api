import { EventEmitter } from "@/features/EventEmitter";
import type { MicError } from "@/features/multimedia/microphone/types/error";
import type { MultimediaDevice } from "@/features/multimedia/types/multimedia-device";

export type Events = {
    error: [error: MicError];
    devices: [devices: MultimediaDevice[]];
    permission: [error: MicError, retry: () => void];
};

export class Microphone extends EventEmitter<Events> {
    public deviceUsed: (MultimediaDevice & { stream: MediaStream }) | null = null;
    public devices: MultimediaDevice[];

    constructor() {
        super();

        this.devices = [];

        navigator.mediaDevices.addEventListener("devicechange", () => this.updateDeviceList());

        this.updateDeviceList().then((devices) => {
            if (devices.length) this.selectDevice(devices[0].deviceId);
        });

        this.requestMicPermission().catch((err) => {
            this.emit("permission", err.name as MicError, () => this.requestMicPermission());
        });
    }

    async requestMicPermission() {
        return navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
            for (const track of stream.getTracks()) {
                track.stop();
            }
        });
    }

    private async updateDeviceList(): Promise<MultimediaDevice[]> {
        const devices: MultimediaDevice[] = await navigator.mediaDevices.enumerateDevices().then((devices) =>
            devices
                .filter((device) => device.kind === "audioinput")
                .map((mic) => ({
                    type: "audio-in",
                    label: mic.label || "Unnamed Microphone",
                    deviceId: mic.deviceId,
                })),
        );

        this.devices = devices;
        this.emit("devices", this.devices);
        return devices;
    }

    async start() {
        if (!this.devices[0]) {
            return null;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: this.devices[0].deviceId } });
        this.deviceUsed = { ...this.devices[0], stream };

        return this.deviceUsed;
    }

    async selectDevice(id: string) {
        const device = this.devices.find((device) => device.deviceId === id) || null;

        if (!device) return null;

        const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: device.deviceId } });

        this.deviceUsed = { ...device, stream };

        return this.deviceUsed;
    }
}
