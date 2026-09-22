import type { TransportStatus } from "@/modules/media/ITransport";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import type { IWSConnection, RelayAddress, WSConnectionEvents } from "./Connection";

// 1000 = o servidor encerrou de propósito; 1008 = o servidor recusou (ex.: token
// inválido). Reconectar entraria em loop ou desfaria um fim intencional.
const NO_RECONNECT_CODES = [1000, 1008];
const RECONNECT_DELAY_MS = 1_000;
const RECONNECT_TIMEOUT_MS = 30_000;

// Keepalive do servidor: um ping de 4 bytes espera "pong" de volta. Tratado aqui para
// `message` só entregar frames de áudio.
const PING_BYTE_LENGTH = 4;

export class WSConnection extends EventEmitter<WSConnectionEvents> implements IWSConnection {
    readonly kind = "ws" as const;
    status: TransportStatus = "connecting";

    private ws?: WebSocket;
    private stopped = false;
    private reconnectDeadline: ReturnType<typeof setTimeout> | null = null;
    private server: RelayAddress | null = null;

    constructor(private readonly token: string) {
        super();
    }

    /**
     * O relay só diz onde atende quando a chamada é aceita, então o endereço chega depois
     * do objeto existir — como no SIP, em que o INVITE já leva o transporte e o destino só
     * se resolve na resposta.
     */
    useRelay(server: RelayAddress): void {
        this.server = server;
    }

    async start(): Promise<void> {
        if (this.ws) return;
        if (!this.server) throw new Error("O relay ainda não informou host e porta");
        this.ws = this.connect();
    }

    async stop(): Promise<void> {
        this.stopped = true;
        this.clearReconnectDeadline();
        this.ws?.close();
        this.ws = undefined;
        this.setStatus("disconnected");
    }

    send(data: ArrayBuffer): void {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data);
    }

    private connect(): WebSocket {
        const { host, port } = this.server as RelayAddress;
        const url = `wss://${host}:${port}?token=${this.token}`;

        const ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";

        this.setStatus("connecting");
        this.bindSocketListeners(ws);

        return ws;
    }

    private bindSocketListeners(socket: WebSocket): void {
        socket.addEventListener("open", () => {
            this.clearReconnectDeadline();
            this.setStatus("connected");
        });

        socket.addEventListener("error", () => {
            this.setStatus("disconnected");
        });

        socket.addEventListener("message", (event: MessageEvent) => {
            const data = event.data as ArrayBuffer;
            if (data.byteLength === PING_BYTE_LENGTH) {
                this.ws?.send("pong");
                return;
            }
            this.emit("message", data);
        });

        socket.addEventListener("close", (event: CloseEvent) => {
            if (this.stopped || NO_RECONNECT_CODES.includes(event.code)) {
                this.setStatus("disconnected");
                return;
            }

            this.setStatus("connecting");

            if (!this.reconnectDeadline) {
                this.reconnectDeadline = setTimeout(() => {
                    this.reconnectDeadline = null;
                    this.setStatus("disconnected");
                }, RECONNECT_TIMEOUT_MS);
            }

            setTimeout(() => {
                if (this.stopped) return;
                this.ws = this.connect();
            }, RECONNECT_DELAY_MS);
        });
    }

    private clearReconnectDeadline(): void {
        if (this.reconnectDeadline) {
            clearTimeout(this.reconnectDeadline);
            this.reconnectDeadline = null;
        }
    }

    private setStatus(status: TransportStatus): void {
        this.status = status;
        this.emit("statusChanged", status);
    }
}
