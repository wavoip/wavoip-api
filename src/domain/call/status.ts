import type { CallStatus } from "@/domain/call/types";

const CALL_STATUSES: readonly CallStatus[] = [
    "RINGING",
    "CALLING",
    "NOT_ANSWERED",
    "ACTIVE",
    "CANCELLED",
    "ENDED",
    "REJECTED",
    "FAILED",
    "DISCONNECTED",
];

/**
 * O servidor tem um vocabulário maior que esta união: sem o estreitamento, um valor
 * desconhecido chegaria ao consumidor tipado como algo que ele não é, e todo `switch`
 * exaustivo do lado de lá cairia no vazio.
 */
function narrow(status: string | undefined): CallStatus {
    return CALL_STATUSES.find((known) => known === status) ?? "ENDED";
}

export type TransitionName = "accept" | "reject" | "cancel" | "end" | "timeout" | "fail";

// Só os comandos locais passam por aqui. O status que o servidor anuncia vale direto.
//
// Recusar e cancelar são desfechos de quem ainda não atendeu, e por isso só valem em
// RINGING e CALLING. Uma chamada ACTIVE tem só duas saídas: terminar ou falhar.
const TRANSITIONS: Record<TransitionName, { allow: (s: CallStatus) => boolean; to: CallStatus }> = {
    accept: { allow: (s) => s === "RINGING" || s === "CALLING", to: "ACTIVE" },
    reject: { allow: (s) => s === "RINGING" || s === "CALLING", to: "REJECTED" },
    cancel: { allow: (s) => s === "RINGING" || s === "CALLING", to: "CANCELLED" },
    end: { allow: (s) => s === "ACTIVE", to: "ENDED" },
    timeout: { allow: (s) => s === "RINGING" || s === "CALLING", to: "NOT_ANSWERED" },
    fail: { allow: (s) => s === "ACTIVE", to: "FAILED" },
};

/** O status depois da transição, ou `null` quando ela não se aplica ao status atual. */
function transition(status: CallStatus, name: TransitionName): CallStatus | null {
    const def = TRANSITIONS[name];
    return def.allow(status) ? def.to : null;
}

export const Status = { narrow, transition };
