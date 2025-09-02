import { Audio } from "@/features/multimedia/audio/audio";
import { Microphone } from "@/features/multimedia/microphone/microphone";
import type { MultimediaError } from "@/features/multimedia/types/error";
import type { MultimediaSocketStatus } from "@/features/multimedia/types/socket";

export class Multimedia {
    private readonly SOCKET_RECONNECT_CODES = [1001, 1006, 1011, 1015];
    private socket: WebSocket | null;
    public socket_status: MultimediaSocketStatus;

    public audio: Audio;
    public microphone: Microphone;

    constructor(params: { onError?: (err: MultimediaError) => void }) {
        this.socket = null;
        this.audio = new Audio({ onError: (err) => params.onError?.({ type: "audio", reason: err }) });
        this.microphone = new Microphone({ onError: (err) => params.onError?.({ type: "audio", reason: err }) });

        this.socket_status = "CLOSED";

        this.fetchDevices();
        navigator.mediaDevices?.addEventListener("devicechange", () => {
            this.fetchDevices();
        });
    }

    async start(server: { ip: string; port: string }, token: string) {
        this.socket = new WebSocket(`wss://${server.ip}:${server.port}?token=${token}`);
        this.socket.binaryType = "arraybuffer";
        this.socket_status = "CONNECTING";

        this.socket.addEventListener("open", () => {
            this.socket_status = "CONNECTED";
        });

        this.socket.addEventListener("error", () => {
            this.socket_status = "ERROR";
            this.audio.stop();
        });

        this.socket.addEventListener("close", (event) => {
            this.socket_status = "CLOSED";

            if (!this.SOCKET_RECONNECT_CODES.includes(event.code)) {
                this.stop();
                return;
            }

            setTimeout(() => {
                this.start(server, token);
            }, 1000);
        });

        this.socket.addEventListener("message", (event) => {
            if (new Uint8Array(event.data).length === 4) {
                this.socket?.send("pong");
            }
        });

        this.microphone.start(this.socket);
        this.audio.start(this.socket);
    }

    stop() {
        this.microphone.stop();
        this.audio.stop();
        this.socket?.close();
        this.socket = null;
    }

    async fetchDevices() {
        const devices = await navigator.mediaDevices.enumerateDevices().catch((err) => {
            console.error("Error fetching microphones:", err);
            return [];
        });

        this.microphone.microphones = devices
            .filter((device) => device.kind === "audioinput")
            .map((mic) => ({
                type: "audio-in",
                label: mic.label || "Unnamed Microphone",
                deviceId: mic.deviceId,
            }));

        this.audio.speakers = devices
            .filter((device) => device.kind === "audiooutput")
            .map((mic) => ({
                type: "audio-out",
                label: mic.label || "Unnamed Speaker",
                deviceId: mic.deviceId,
            }));
    }
}
