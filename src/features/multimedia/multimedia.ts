import { EventEmitter } from "@/features/EventEmitter";
import type { CallTransport } from "@/features/device/types/socket";
import { Microphone } from "@/features/multimedia/microphone/microphone";
import { Speaker } from "@/features/multimedia/speaker/speaker";
import type { ITransport } from "@/features/multimedia/transport/ITransport";
import { WebRTCTransport } from "@/features/multimedia/transport/webrtc/WebRTCTransport";
import { WebsocketTransport } from "@/features/multimedia/transport/websocket/WebsocketTransport";
import type { MultimediaError } from "@/features/multimedia/types/error";

type Events = {
    error: [error: MultimediaError];
    permission: [error: MultimediaError, retry?: () => void];
};

export class Multimedia extends EventEmitter<Events> {
    private webRTC: WebRTCTransport | null = null;
    private websocket: WebsocketTransport | null = null;

    public speaker: Speaker;
    public microphone: Microphone;

    constructor() {
        super();

        this.microphone = new Microphone();
        this.speaker = new Speaker();

        this.microphone.on("error", (err) =>
            this.emit("error", {
                type: "microphone",
                reason: err,
            }),
        );

        this.microphone.on("permission", (err, retry) =>
            this.emit("permission", { type: "microphone", reason: err }, retry),
        );

        this.speaker.on("error", (err) =>
            this.emit("error", {
                type: "audio",
                reason: err,
            }),
        );
    }

    async canCall(): Promise<{ err: string | null }> {
        if (!this.microphone.devices.length) {
            return { err: "Nenhum microfone encontrado" };
        }

        return { err: null };
    }

    async startTransport(token: string, config: CallTransport): Promise<ITransport> {
        if (config.type === "official") {
            if (!this.webRTC) {
                this.webRTC = new WebRTCTransport(this.microphone);
            }
            await this.webRTC.start(config.sdpOffer);
            return this.webRTC;
        }

        if (!this.websocket) {
            this.websocket = new WebsocketTransport(this.microphone);
        }

        await this.websocket.start(config, token);
        return this.websocket;
    }
}
