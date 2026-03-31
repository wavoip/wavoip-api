import { EventEmitter } from "@/features/EventEmitter";
import type { CallTransport } from "@/features/call/types/call";
import type { Microphone } from "@/features/multimedia/microphone/microphone";
import type { ITransport, TransportStatus } from "@/features/multimedia/transport/ITransport";
import { AudioInput } from "@/features/multimedia/transport/websocket/audio-input/audio-input";
import { AudioOutput } from "@/features/multimedia/transport/websocket/audio-output/audio-output";

type Events = {
    status: [status: TransportStatus];
    a: [];
    reconnect_timeout: [];
};

export class WebsocketTransport extends EventEmitter<Events> implements ITransport {
    private readonly SOCKET_RECONNECT_CODES = [1000, 1001, 1005, 1006, 1011, 1015];
    private readonly RECONNECT_TIMEOUT_MS = 30_000;

    private socket: WebSocket | null = null;
    private isStopped = false;
    private reconnectDeadline: ReturnType<typeof setTimeout> | null = null;

    private readonly in: AudioInput;
    private readonly out: AudioOutput;

    public audioAnalyser: Promise<AnalyserNode>;
    public status: TransportStatus = "connecting";

    constructor(private readonly microphone: Microphone) {
        super();

        this.in = new AudioInput(new AudioContext({ latencyHint: 0 }));
        this.out = new AudioOutput(new AudioContext({ sampleRate: 16000, latencyHint: 0 }));

        this.audioAnalyser = Promise.resolve({} as AnalyserNode);
    }

    async start(transport: CallTransport<"unofficial">, token: string) {
        const { device } = await this.microphone.start();
        if (!device?.stream) return;

        await this.in.ready;
        await this.in.start(device.stream);

        await this.out.ready;
        await this.out.start();
        this.audioAnalyser = Promise.resolve(this.out.createAnalyserNode());

        this.socket = this.connect(transport, token);

        this.in.on("audio-data", (data) => {
            if (this.socket?.readyState === WebSocket.OPEN) {
                this.socket.send(data as ArrayBufferLike);
            }
        });
    }

    async stop() {
        this.isStopped = true;
        this.clearReconnectDeadline();
        this.socket?.close();
        this.socket = null;

        this.microphone.stop();

        await this.in.stop();
        await this.out.stop();
    }

    private connect(transport: CallTransport<"unofficial">, token: string) {
        const { server } = transport;
        const url = `wss://${server.host}:${server.port}?token=${token}`;
        const socket = new WebSocket(url);
        socket.binaryType = "arraybuffer";

        this.status = "connecting";
        this.emit("status", this.status);

        this.bindListeners(socket, transport, token);

        return socket;
    }

    private bindListeners(socket: WebSocket, transport: CallTransport<"unofficial">, token: string) {
        socket.addEventListener("open", () => {
            this.clearReconnectDeadline();
            this.status = "connected";
            this.emit("status", this.status);
        });

        socket.addEventListener("error", () => {
            this.status = "disconnected";
            this.emit("status", this.status);
        });

        socket.addEventListener("close", (event) => {
            this.status = "connecting";
            this.emit("status", this.status);

            if (this.isStopped || !this.SOCKET_RECONNECT_CODES.includes(event.code)) {
                this.status = "disconnected";
                this.emit("status", this.status);

                return;
            }

            if (!this.reconnectDeadline) {
                this.reconnectDeadline = setTimeout(() => {
                    this.reconnectDeadline = null;
                    this.isStopped = true;
                    this.emit("reconnect_timeout");
                }, this.RECONNECT_TIMEOUT_MS);
            }

            setTimeout(() => {
                if (!this.isStopped) {
                    this.socket = this.connect(transport, token);
                }
            }, 250);
        });

        socket.addEventListener("message", (event) => {
            if (new Uint8Array(event.data).length === 4) {
                this.socket?.send("pong");
                return;
            }
            this.out.sendAudioData(event.data);
        });
    }

    private clearReconnectDeadline() {
        if (this.reconnectDeadline) {
            clearTimeout(this.reconnectDeadline);
            this.reconnectDeadline = null;
        }
    }
}
