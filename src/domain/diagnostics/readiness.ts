import type { CallType } from "@/domain/call/types";
import type { DiagnosticCheck, DiagnosticCode } from "@/domain/diagnostics/types";

/** Se um tipo de chamada funcionaria agora, e o que falta se não. */
export type Readiness = {
    readonly ready: boolean;
    readonly blockedBy: readonly DiagnosticCode[];
};

/**
 * O que impede cada tipo de chamada. Áudio e microfone valem para os dois; o transporte é o
 * que os separa.
 *
 * O STUN não entra: sem ele a chamada ainda pode sair por candidato local ou por TURN, e
 * reprovar o ambiente por isso seria alarme falso. Ele é aviso, não impedimento.
 */
const BLOCKERS: Readonly<Record<CallType, readonly DiagnosticCode[]>> = {
    OFFICIAL: ["AUDIO_ENGINE_FAILED", "MICROPHONE_MISSING", "MICROPHONE_PERMISSION_DENIED", "WEBRTC_MISSING"],
    UNOFFICIAL: ["AUDIO_ENGINE_FAILED", "MICROPHONE_MISSING", "MICROPHONE_PERMISSION_DENIED", "BINARY_SOCKET_MISSING"],
};

function of(checks: readonly DiagnosticCheck[]): Readonly<Record<CallType, Readiness>> {
    const found = new Set(checks.map((check) => check.code));
    return {
        OFFICIAL: readinessFrom(found, BLOCKERS.OFFICIAL),
        UNOFFICIAL: readinessFrom(found, BLOCKERS.UNOFFICIAL),
    };
}

function readinessFrom(found: ReadonlySet<DiagnosticCode>, blockers: readonly DiagnosticCode[]): Readiness {
    const blockedBy = blockers.filter((code) => found.has(code));
    return { ready: blockedBy.length === 0, blockedBy };
}

export const Readiness = { of, BLOCKERS };
