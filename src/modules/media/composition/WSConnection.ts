import type { TransportStatus } from "@/modules/media/ITransport";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import type { IWSConnection, WSConnectionEvents } from "./Connection";

// 1000 = Normal Closure (server intentionally ended the connection)
// 1008 = Policy Violation (server rejected the connection, e.g. invalid token)
const NO_RECONNECT_CODES = [1000, 1008];
const RECONNECT_DELAY_MS = 1_000;
const RECONNECT_TIMEOUT_MS = 30_000;

// Server keepalive: 4-byte ping message expects a "pong" string reply. Handled
// inside the connection so consumers only see audio frames on `message`.
const PING_BYTE_LENGTH = 4;

/**
 * WebSocket connection role — owns the socket lifecycle (open / close /
 * automatic reconnect) and the server keepalive ping. Knows nothing about
 * audio or stats: binary frames flow through `send()` and `message` events;
 * higher layers slot in mic encoding (`AudioInput`), speaker playback
 * (`AudioOutput`), and counters (`WSStatsAdapter`).
 *
 * Reconnect policy:
 *   - Skip codes {1000, 1008}: normal closure and policy violations (e.g.
 *     invalid token) — reconnecting would loop or override an intentional end.
 *   - On any other close, schedule a `setTimeout` to retry after 1s.
 *   - A 30s deadline timer arms on the first unexpected close; if no successful
 *     `open` lands within that window, status transitions to `disconnected`.
 *   - The `stopped` flag (set by `stop()`) short-circuits any pending retry.
 */
export class WSConnection extends EventEmitter<WSConnectionEvents> implements IWSConnection {
    readonly kind = "ws" as const;
    status: TransportStatus = "connecting";

    private ws?: WebSocket;
    private stopped = false;
    private reconnectDeadline: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private readonly server: { host: string; port: string },
        private readonly token: string,
    ) {
        super();
    }

    async start(): Promise<void> {
        if (this.ws) return;
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
        const url = `wss://${this.server.host}:${this.server.port}?token=${this.token}`;

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
