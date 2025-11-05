import { EventEmitter } from "@/features/EventEmitter";
import type { CallTransport } from "@/features/device/types/socket";
import type { Microphone } from "@/features/multimedia/microphone/microphone";
import type { ITransport, TransportStatus } from "@/features/multimedia/transport/ITransport";
import { AudioInput } from "@/features/multimedia/transport/websocket/audio-input/audio-input";
import { AudioOutput } from "@/features/multimedia/transport/websocket/audio-output/audio-output";

type Events = {
    status: [status: TransportStatus];
    a: [];
};

export class WebsocketTransport extends EventEmitter<Events> implements ITransport {
    private readonly SOCKET_RECONNECT_CODES = [1001, 1006, 1011, 1015];
    private socket: WebSocket | null = null;

    private readonly in: AudioInput;
    private readonly out: AudioOutput;

    private audioAnalyserDeffer: { resolve?: (node: AnalyserNode | PromiseLike<AnalyserNode>) => void } = {};

    public audioAnalyser: Promise<AnalyserNode>;
    public status: TransportStatus = "connecting";

    constructor(private readonly microphone: Microphone) {
        super();

        this.in = new AudioInput(new AudioContext({ latencyHint: 0 }));
        this.out = new AudioOutput(new AudioContext({ sampleRate: 16000, latencyHint: 0 }));

        this.audioAnalyser = new Promise<AnalyserNode>((resolve) => {
            this.audioAnalyserDeffer = { resolve };
        });
    }

    async start(transport: CallTransport<"unofficial">, token: string) {
        if (!this.microphone.deviceUsed) return;

        for (const track of this.microphone.deviceUsed.stream.getTracks()) {
            track.enabled = true;
        }

        await this.in.ready;
        await this.in.start(this.microphone.deviceUsed.stream);

        await this.out.ready;
        await this.out.start();
        this.audioAnalyserDeffer.resolve?.(this.out.createAnalyserNode());

        this.socket = this.connect(transport, token);

        this.in.on("audio-data", (data) => this.socket?.send(data as ArrayBufferLike));
        this.socket.addEventListener("message", (event) => {
            if (new Uint8Array(event.data).length === 4) {
                this.socket?.send("pong");
                return;
            }
            this.out.sendAudioData(event.data);
        });
    }

    async stop() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
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
            this.status = "connected";
            this.emit("status", this.status);
        });

        socket.addEventListener("error", () => {
            this.status = "disconnected";
            this.emit("status", this.status);
        });

        socket.addEventListener("close", (event) => {
            this.status = "disconnected";
            this.emit("status", this.status);

            if (!this.SOCKET_RECONNECT_CODES.includes(event.code)) {
                return;
            }

            setTimeout(() => {
                this.socket = this.connect(transport, token);
            }, 1000);
        });
    }
}
