import type { DeviceSocket } from "@/adapters/socketio/DeviceSocket";

type SocketListener = (...args: unknown[]) => void;
type AckMode = "success" | "error" | "timeout";

/**
 * Socket.io do device em memória: `receive` simula o servidor emitindo, e o `emit` do
 * cliente responde conforme `ackMode`. O `timeout(ms).emit` segue a assinatura
 * `(err, res)` do socket.io.
 */
export class FakeDeviceSocket {
    readonly sent: { event: string; args: unknown[]; timeoutMs?: number }[] = [];
    ackMode: AckMode = "success";
    errorCode = "CALL_NOT_FOUND";
    successResult: unknown;

    private readonly listeners = new Map<string, SocketListener[]>();

    on(event: string, listener: SocketListener): this {
        this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
        return this;
    }

    off(event: string, listener: SocketListener): this {
        const remaining = (this.listeners.get(event) ?? []).filter((l) => l !== listener);
        this.listeners.set(event, remaining);
        return this;
    }

    receive(event: string, ...args: unknown[]): void {
        for (const listener of this.listeners.get(event) ?? []) listener(...args);
    }

    emit(event: string, ...args: unknown[]): this {
        this.sent.push({ event, args });
        const ack = args[args.length - 1];
        if (typeof ack === "function") (ack as (response: unknown) => void)(this.response());
        return this;
    }

    timeout(timeoutMs: number) {
        return {
            emitWithAck: async (event: string, ...args: unknown[]): Promise<unknown> => {
                this.sent.push({ event, args, timeoutMs });
                if (this.ackMode === "timeout") throw new Error("operation has timed out");
                return this.response();
            },
        };
    }

    listenerCount(event: string): number {
        return this.listeners.get(event)?.length ?? 0;
    }

    asDeviceSocket(): DeviceSocket {
        return this as unknown as DeviceSocket;
    }

    private response(): unknown {
        if (this.ackMode === "error") return { type: "error", result: this.errorCode };
        return this.successResult === undefined ? { type: "success" } : { type: "success", result: this.successResult };
    }
}
