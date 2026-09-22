import type { CallSession } from "@/application/call/CallSession";
import type { CallSignalingPort, ServerCallEvent, Unsubscribe } from "@/ports/SignalingPort";

// Queda e volta da perna de mídia não são terminais: a chamada fica na tabela para o
// `connected` seguinte ainda ser roteado.
const TERMINAL: ServerCallEvent["type"][] = ["ended", "unanswered", "rejected", "failed"];

/**
 * Uma inscrição na porta de sinalização para todas as chamadas, e não uma por chamada:
 * assinar por chamada deixava N × 11 listeners filtrados no socket.
 */
export class CallRegistry {
    private readonly sessions = new Map<string, CallSession>();
    private readonly unsubscribe: Unsubscribe;

    constructor(signaling: CallSignalingPort) {
        this.unsubscribe = signaling.onCallEvent((callId, event) => this.route(callId, event));
    }

    /** O Unsubscribe devolvido só é necessário para descartar uma chamada no meio do caminho. */
    register(session: CallSession): Unsubscribe {
        this.sessions.set(session.id, session);
        return () => {
            this.sessions.delete(session.id);
        };
    }

    has(callId: string): boolean {
        return this.sessions.has(callId);
    }

    stop(): void {
        this.unsubscribe();
        this.sessions.clear();
    }

    // A chamada sai da tabela depois de tratar o evento: enquanto os listeners dela rodam,
    // ela ainda é uma chamada conhecida.
    private route(callId: string, event: ServerCallEvent): void {
        const session = this.sessions.get(callId);
        if (!session) return;
        session.handleServerEvent(event);
        if (TERMINAL.includes(event.type)) this.sessions.delete(callId);
    }
}
