import type { CallStatus, TransportStatus } from "@/domain/call/types";

/**
 * How an active call is holding up, with both of its legs folded into one state: the local
 * media and the leg between the server and WhatsApp. Either one dropping in a recoverable
 * way reads as `"reconnecting"`; `"disconnected"` means the call is lost.
 */
export type CallConnection = "connected" | "reconnecting" | "disconnected";

// Na v2 as duas pernas eram campos separados, e ninguém tinha as duas na mão: dava para
// mostrar "conectado" com a perna do WhatsApp caída.
function merge(transport: TransportStatus, status: CallStatus): CallConnection {
    if (transport === "disconnected") return "disconnected";
    if (status === "DISCONNECTED") return "reconnecting";
    if (transport === "connecting" || transport === "reconnecting") return "reconnecting";
    return "connected";
}

export const Connection = { merge };
