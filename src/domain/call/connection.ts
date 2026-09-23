import type { CallStatus, TransportStatus } from "@/domain/call/types";

/**
 * O estado da conexão de uma chamada ativa, com as duas pernas juntas: a mídia local
 * (o transporte) e a perna do WhatsApp (que o servidor anuncia como `call:disconnected`
 * e `call:connected`).
 *
 * Eram duas coisas separadas na v2, e ninguém tinha as duas na mão: a interface mostrava
 * "conectado" com a perna do WhatsApp caída, ou o contrário.
 */
export type CallConnection = "connected" | "reconnecting" | "disconnected";

/** Qualquer perna caindo de forma recuperável deixa a chamada em `reconnecting`. */
function merge(transport: TransportStatus, status: CallStatus): CallConnection {
    if (transport === "disconnected") return "disconnected";
    if (status === "DISCONNECTED") return "reconnecting";
    if (transport === "connecting" || transport === "reconnecting") return "reconnecting";
    return "connected";
}

export const Connection = { merge };
