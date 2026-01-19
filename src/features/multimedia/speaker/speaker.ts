import { EventEmitter } from "@/features/EventEmitter";
import type { MultimediaDevice } from "@/features/multimedia/types/multimedia-device";

export type Events = {
    devices: [devices: MultimediaDevice[]];
};

export class Speaker extends EventEmitter<Events> {
    public deviceUsed: (MultimediaDevice & { stream?: MediaStream }) | null = null;
    public devices: MultimediaDevice[] = [];

    constructor() {
        super();

        navigator.mediaDevices.addEventListener("devicechange", () => this.updateDeviceList());
        this.updateDeviceList();
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

    // async start() {
    //     const { stream, err } = await navigator.mediaDevices
    //         .getUserMedia({ audio: true })
    //         .then((stream) => ({ stream, err: null }))
    //         .catch((err: DOMException) => ({ stream: null, err }));
    //
    //     if (!stream) return { device: null, err: new MultimediaError("audio", err) };
    //
    //     const device = this.devices.find((device) => device.deviceId === "") as MultimediaDevice;
    //
    //     this.deviceUsed = { ...device, stream };
    //
    //     return { device: this.deviceUsed, err: null };
    // }
}
