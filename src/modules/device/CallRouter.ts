import type { Call } from "@/modules/device/Call";
import { Status } from "@/domain/call/status";
import type { DeviceSocket, ServerEvents } from "@/modules/device/WebSocket";
import type { Unsubscribe } from "@/modules/shared/EventEmitter";

// O Socket tipado do socket.io expõe um FallbackToUntypedListener que o compilador não
// unifica com o genérico E daqui. Um cast só, via `unknown`, e o resto do `bind` fica
// tipado.
type SocketLike = {
    on<E extends keyof ServerEvents>(event: E, handler: ServerEvents[E]): unknown;
    off<E extends keyof ServerEvents>(event: E, handler: ServerEvents[E]): unknown;
};

/**
 * Um listener por evento `call:*` no socket compartilhado, e não um por chamada: o
 * `wireSocket` por Call deixava N × 9 listeners filtrados no socket.
 */
export class CallRouter {
    private readonly calls = new Map<string, Call>();
    private readonly unsubs: Array<() => void> = [];
    private started = false;

    constructor(private readonly socket: DeviceSocket) {}

    start(): void {
        if (this.started) return;
        this.started = true;

        const s = this.socket as unknown as SocketLike;
        const bind = <E extends keyof ServerEvents>(event: E, handler: ServerEvents[E]) => {
            s.on(event, handler);
            this.unsubs.push(() => s.off(event, handler));
        };

        bind("call:ringing", (id) => {
            const call = this.calls.get(id);
            if (!call) return;
            call.settle("RINGING");
            call.emit("ringing");
            call.emit("status", "RINGING");
        });
        // Instance antiga não manda `outcome`, e o status cai em ENDED.
        bind("call:ended", (id, outcome) => {
            const call = this.calls.get(id);
            if (!call) return;
            // `status` antes de `ended`, o inverso dos outros handlers, de propósito: todo
            // proxy se desmonta no `ended`, e o do `Offer` solta as inscrições. Um status
            // emitido depois não chega a ninguém, e uma oferta cujo chamador desistiu nunca
            // saberia que foi CANCELLED.
            const status = Status.narrow(outcome?.status);
            call.settle(status);
            call.emit("status", status);
            call.emit("ended");
            this.calls.delete(id);
        });
        bind("call:accepted", (id) => {
            const call = this.calls.get(id);
            if (!call) return;
            call.settle("ACTIVE");
            call.emit("accepted");
            call.emit("status", "ACTIVE");
        });
        bind("call:answered", (id, mediaPlan) => {
            const call = this.calls.get(id);
            if (!call) return;
            call.settle("ACTIVE");
            call.emit("answered", mediaPlan);
            call.emit("status", "ACTIVE");
        });
        bind("call:unanswered", (id) => {
            const call = this.calls.get(id);
            if (!call) return;
            call.settle("NOT_ANSWERED");
            call.emit("unanswered");
            call.emit("status", "NOT_ANSWERED");
            this.calls.delete(id);
        });
        bind("call:rejected", (id) => {
            const call = this.calls.get(id);
            if (!call) return;
            call.settle("REJECTED");
            call.emit("rejected");
            call.emit("status", "REJECTED");
            this.calls.delete(id);
        });
        bind("call:failed", (id, err) => {
            const call = this.calls.get(id);
            if (!call) return;
            call.settle("FAILED");
            call.emit("failed", err);
            call.emit("status", "FAILED");
            this.calls.delete(id);
        });
        // Queda e volta da perna de mídia não são terminais: a chamada fica em `this.calls`
        // para o call:connected seguinte ainda ser roteado.
        bind("call:disconnected", (id) => {
            const call = this.calls.get(id);
            if (!call) return;
            call.settle("DISCONNECTED");
            call.emit("status", "DISCONNECTED");
        });
        bind("call:connected", (id) => {
            const call = this.calls.get(id);
            if (!call) return;
            call.settle("ACTIVE");
            call.emit("status", "ACTIVE");
        });
        bind("call:stats", (id, stats) => {
            this.calls.get(id)?.applyServerStats(stats);
        });
        bind("call:peer:muted", (id, muted) => {
            this.calls.get(id)?.emit("peerMuted", muted);
        });
    }

    /**
     * Os eventos terminais já tiram a chamada da tabela; o Unsubscribe devolvido só é
     * necessário para descartar uma chamada no meio do caminho.
     */
    register(call: Call): Unsubscribe {
        this.calls.set(call.id, call);
        return () => this.calls.delete(call.id);
    }

    has(id: string): boolean {
        return this.calls.has(id);
    }

    stop(): void {
        for (const u of this.unsubs) u();
        this.unsubs.length = 0;
        this.calls.clear();
        this.started = false;
    }
}
