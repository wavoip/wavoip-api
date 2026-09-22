import type { DeviceSocket } from "@/modules/device/WebSocket";

type SocketListener = (...args: unknown[]) => void;

/**
 * Socket.io do device em memória: `receive` simula o servidor emitindo, e o `emit` do
 * cliente responde todo ack com sucesso.
 */
export class FakeDeviceSocket {
    readonly sent: { event: string; args: unknown[] }[] = [];
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
        if (typeof ack === "function") ack({ type: "success" });
        return this;
    }

    listenerCount(event: string): number {
        return this.listeners.get(event)?.length ?? 0;
    }

    asDeviceSocket(): DeviceSocket {
        return this as unknown as DeviceSocket;
    }
}
