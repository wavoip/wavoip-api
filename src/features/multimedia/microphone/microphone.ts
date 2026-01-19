import { EventEmitter } from "@/features/EventEmitter";
import { MultimediaError } from "@/features/multimedia/MultimediaError";
import type { MultimediaDevice } from "@/features/multimedia/types/multimedia-device";

export type Events = {
    devices: [devices: MultimediaDevice[]];
};

export class Microphone extends EventEmitter<Events> {
    public deviceUsed: (MultimediaDevice & { stream?: MediaStream }) | null = null;
    public devices: MultimediaDevice[] = [];

    constructor() {
        super();

        navigator.mediaDevices.addEventListener("devicechange", () => this.updateDeviceList());
        this.updateDeviceList();
    }

    async requestMicPermission() {
        return navigator.mediaDevices.getUserMedia({ audio: true });
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
        if (!this.devices.length) {
            return { device: null, err: new MultimediaError("microphone", new DOMException("", "NotFoundError")) };
        }

        return this.selectDevice(this.deviceUsed?.deviceId);
    }

    async selectDevice(id?: string) {
        const { stream, err } = await navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then((stream) => ({ stream, err: null }))
            .catch((err: DOMException) => ({ stream: null, err }));

        if (!stream) return { device: null, err: new MultimediaError("microphone", err) };

        const device = this.devices.find((d) => d.deviceId === id) as MultimediaDevice;

        this.deviceUsed = { ...device, stream };

        return { device: this.deviceUsed, err: null };
    }

    stop() {
        if (this.deviceUsed?.stream) {
            for (const track of this.deviceUsed.stream.getTracks()) {
                track.stop();
            }

            this.deviceUsed.stream = undefined;
        }
    }
}
