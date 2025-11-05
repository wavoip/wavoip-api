import { EventEmitter } from "@/features/EventEmitter";
import type { AudioError } from "@/features/multimedia/speaker/types/error";
import type { MultimediaDevice } from "@/features/multimedia/types/multimedia-device";

export type Events = {
    error: [error: AudioError];
    devices: [devices: MultimediaDevice[]];
};

export class Speaker extends EventEmitter<Events> {
    public deviceUsed: (MultimediaDevice & { stream: MediaStream }) | null = null;
    public devices: MultimediaDevice[];

    constructor() {
        super();

        this.devices = [];

        navigator.mediaDevices.getUserMedia({ audio: true }).catch((err) => this.emit("error", err.name as AudioError));
        navigator.mediaDevices.addEventListener("devicechange", () => this.updateDeviceList());

        this.updateDeviceList().then((devices) => {
            if (devices.length) this.selectDevice(devices[0].deviceId);
        });
    }

    private async updateDeviceList(): Promise<MultimediaDevice[]> {
        const devices = await navigator.mediaDevices.enumerateDevices().then((devices) =>
            devices
                .filter((device) => device.kind === "audiooutput")
                .map((mic) => ({
                    type: "audio-out",
                    label: mic.label || "Unnamed Speaker",
                    deviceId: mic.deviceId,
                })),
        );

        this.devices = devices as MultimediaDevice[];
        this.emit("devices", this.devices);
        return devices as MultimediaDevice[];
    }

    async selectDevice(id: string) {
        const device = this.devices.find((device) => device.deviceId === id) || null;

        if (!device) return null;

        const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: device.deviceId } });

        this.deviceUsed = { ...device, stream };

        return this.deviceUsed;
    }
}
