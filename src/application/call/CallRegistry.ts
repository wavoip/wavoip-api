import type { CallSession } from "@/application/call/CallSession";
import type { CallSignalingPort, ServerCallEvent, Unsubscribe } from "@/ports/SignalingPort";

// Queda e volta da perna de mídia não são terminais: a chamada fica na tabela para o
// `connected` seguinte ainda ser roteado.
const TERMINAL: ServerCallEvent["type"][] = ["ended", "unanswered", "rejected", "failed"];

/**
 * Uma inscrição na porta de sinalização para todas as chamadas, e não uma por chamada:
 * assinar por chamada deixava N × 11 listeners filtrados no socket.
 */
type Routed = { session: CallSession; stopWatching: Unsubscribe };

export class CallRegistry {
    private readonly routed = new Map<string, Routed>();
    private readonly unsubscribe: Unsubscribe;

    constructor(signaling: CallSignalingPort) {
        this.unsubscribe = signaling.onCallEvent((callId, event) => this.route(callId, event));
    }

    /**
     * A chamada sai da tabela sozinha: nos eventos terminais do servidor, e quando ela
     * mesma se encerra sem esperar o eco dele (a recusa de uma oferta).
     */
    register(session: CallSession): void {
        const stopWatching = session.on("closed", () => this.drop(session.id));
        this.routed.set(session.id, { session, stopWatching });
    }

    has(callId: string): boolean {
        return this.routed.has(callId);
    }

    stop(): void {
        this.unsubscribe();
        for (const { stopWatching } of this.routed.values()) stopWatching();
        this.routed.clear();
    }

    // A chamada sai da tabela depois de tratar o evento: enquanto os listeners dela rodam,
    // ela ainda é uma chamada conhecida.
    private route(callId: string, event: ServerCallEvent): void {
        const entry = this.routed.get(callId);
        if (!entry) return;
        entry.session.handleServerEvent(event);
        if (TERMINAL.includes(event.type)) this.drop(callId);
    }

    private drop(callId: string): void {
        this.routed.get(callId)?.stopWatching();
        this.routed.delete(callId);
    }
}
