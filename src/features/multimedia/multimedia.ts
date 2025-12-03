import type { CallTransport } from "@/features/call/types/call";
import type { MultimediaError } from "@/features/multimedia/MultimediaError";
import { Microphone } from "@/features/multimedia/microphone/microphone";
import { Speaker } from "@/features/multimedia/speaker/speaker";
import type { ITransport } from "@/features/multimedia/transport/ITransport";
import { WebRTCTransport } from "@/features/multimedia/transport/webrtc/WebRTCTransport";
import { WebsocketTransport } from "@/features/multimedia/transport/websocket/WebsocketTransport";

export class Multimedia {
    private webRTC: WebRTCTransport | null = null;
    private websocket: WebsocketTransport | null = null;

    public speaker = new Speaker();
    public microphone = new Microphone();

    async canCall(): Promise<{ err: MultimediaError | null }> {
        const { device: mic, err: micErr } = await this.microphone.start();

        if (!mic) {
            return { err: micErr };
        }

        const { device: speaker, err: speakerErr } = await this.speaker.start();

        if (!speaker) {
            return { err: speakerErr };
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
