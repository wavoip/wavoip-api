import type { CallType } from "@/domain/call/types";
import type { Readiness } from "@/domain/diagnostics/readiness";

/**
 * O que o diagnóstico sabe checar. Os códigos são estáveis: quem integra ramifica neles e
 * escreve o próprio texto, como no resto da biblioteca.
 */
export type DiagnosticCode =
    /** O motor de áudio subiu e está tocando. */
    | "AUDIO_RUNNING"
    /** O motor subiu, mas a plataforma segura o som até a pessoa tocar na tela. */
    | "USER_GESTURE_REQUIRED"
    /** O motor não subiu: `details.cause` tem o que a plataforma disse. */
    | "AUDIO_ENGINE_FAILED"
    /** Existe ao menos um microfone. */
    | "MICROPHONE_FOUND"
    /** Não há microfone algum para a chamada usar. */
    | "MICROPHONE_MISSING"
    /** Os aparelhos aparecem sem nome, o que só acontece antes da permissão ser dada. */
    | "MICROPHONE_PERMISSION_PENDING"
    /** A plataforma faz chamada oficial: existe WebRTC. */
    | "WEBRTC_AVAILABLE"
    | "WEBRTC_MISSING"
    /** A plataforma faz chamada não oficial: existe socket binário. */
    | "BINARY_SOCKET_AVAILABLE"
    | "BINARY_SOCKET_MISSING"
    /** Ao menos um servidor STUN respondeu: há caminho para a mídia sair. */
    | "STUN_REACHABLE"
    /** Nenhum respondeu — firewall ou proxy bloqueando UDP, em geral. */
    | "STUN_UNREACHABLE";

export type DiagnosticSeverity = "ok" | "warning" | "failure";

export type DiagnosticCheck = {
    readonly code: DiagnosticCode;
    readonly severity: DiagnosticSeverity;
    /** Números e nomes que o texto de quem integra precisa: contagens, servidores, causas. */
    readonly details?: Record<string, unknown>;
};

export type DiagnosticsReport = {
    readonly checks: readonly DiagnosticCheck[];
    readonly readiness: Readonly<Record<CallType, Readiness>>;
};
