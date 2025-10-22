import type { CallTransport } from "@/features/device/types/socket";
import { EventEmitter } from "@/features/EventEmitter";
import { Audio } from "@/features/multimedia/audio/audio";
import { Microphone } from "@/features/multimedia/microphone/microphone";
import type { MultimediaError } from "@/features/multimedia/types/error";
import type { MultimediaSocketStatus } from "@/features/multimedia/types/socket";

type Events = {
    error: [error: MultimediaError];
    status: [status: MultimediaSocketStatus];
    audioAnalyser: [analyser: AnalyserNode];
};

export class Multimedia extends EventEmitter<Events> {
    private readonly SOCKET_RECONNECT_CODES = [1001, 1006, 1011, 1015];
    private socket: WebSocket | null;
    public socket_status: MultimediaSocketStatus;

    public audio: Audio;
    public microphone: Microphone;

    constructor() {
        super();

        this.socket = null;
        this.microphone = new Microphone({
            onError: (err) => this.emit("error", { type: "microphone", reason: err }),
        });
        this.audio = new Audio({
            onError: (err) => this.emit("error", { type: "audio", reason: err }),
            onAnalyser: (analyser) => this.emit("audioAnalyser", analyser),
        });

        this.socket_status = "CLOSED";
        this.emit("status", this.socket_status);

        this.fetchDevices();
        navigator.mediaDevices?.addEventListener("devicechange", () => {
            this.fetchDevices();
        });
    }

    async start(token: string, transport: CallTransport) {
        if (transport.type === "official") return;

        const { server } = transport;

        this.socket = new WebSocket(`wss://${server.host}:${server.port}?token=${token}`);
        this.socket.binaryType = "arraybuffer";
        this.socket_status = "CONNECTING";
        this.emit("status", this.socket_status);

        this.socket.addEventListener("open", () => {
            this.socket_status = "CONNECTED";
            this.emit("status", this.socket_status);
        });

        this.socket.addEventListener("error", () => {
            this.socket_status = "ERROR";
            this.emit("status", this.socket_status);
            this.audio.stop();
        });

        this.socket.addEventListener("close", (event) => {
            this.socket_status = "CLOSED";
            this.emit("status", this.socket_status);

            if (!this.SOCKET_RECONNECT_CODES.includes(event.code)) {
                this.stop();
                return;
            }

            setTimeout(() => {
                this.start(token, transport);
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

        this.removeAllListeners("status");
        this.removeAllListeners("audioAnalyser");
    }

    async fetchDevices() {
        const devices = await navigator.mediaDevices.enumerateDevices().catch((err) => {
            console.error("Error fetching microphones:", err);
            return [];
        });

        this.microphone.devices = devices
            .filter((device) => device.kind === "audioinput")
            .map((mic) => ({
                type: "audio-in",
                label: mic.label || "Unnamed Microphone",
                deviceId: mic.deviceId,
            }));

        this.audio.devices = devices
            .filter((device) => device.kind === "audiooutput")
            .map((mic) => ({
                type: "audio-out",
                label: mic.label || "Unnamed Speaker",
                deviceId: mic.deviceId,
            }));
    }
}
