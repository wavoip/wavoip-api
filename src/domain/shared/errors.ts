/**
 * O vocabulário de erro da biblioteca, agrupado por origem. O `code` é estável: é nele
 * que o integrador decide o fluxo e é ele que ele traduz para o usuário dele.
 *
 * Código de protocolo — da instance, do UWP, da API central — é traduzido para cá na
 * borda (no adaptador que o recebe) e nunca vaza para quem consome a biblioteca. O que
 * não tem tradução vira `UNKNOWN`, com o valor bruto no `cause`.
 */

/** O device não pode atender ao pedido, ou não foi encontrado. */
export type DeviceErrorCode =
    | "DEVICE_NOT_LINKED"
    | "DEVICE_RESTARTING"
    | "DEVICE_ERROR"
    | "DEVICE_NOT_FOUND"
    | "WAKE_UP_RATE_LIMITED"
    | "NO_DEVICES";

/** O comando saiu, mas o servidor não o aceitou — ou não respondeu. */
export type CommandErrorCode =
    | "ACK_TIMEOUT"
    | "CALL_ALREADY_ANSWERED"
    | "CALL_NOT_FOUND"
    | "DEVICE_BUSY"
    /** O pedido não chegou ao servidor: rede, DNS ou TLS. */
    | "NETWORK_ERROR";

/** O áudio local: permissão, aparelho e negociação de mídia. */
export type MediaErrorCode =
    | "MICROPHONE_PERMISSION_DENIED"
    | "AUDIO_DEVICE_NOT_FOUND"
    | "OUTPUT_SELECTION_UNSUPPORTED"
    | "VOLUME_OUT_OF_RANGE"
    | "MEDIA_NEGOTIATION_FAILED"
    | "UNSUPPORTED_MEDIA_PLAN";

/** Por que uma chamada que estava de pé caiu. */
export type CallFailureCode =
    /** O microfone daqui parou de enviar áudio. */
    | "LOCAL_AUDIO_TIMEOUT"
    /** O contato parou de enviar áudio. */
    | "REMOTE_AUDIO_TIMEOUT"
    /** A chamada perdeu contato com o servidor. */
    | "CONNECTION_TIMEOUT"
    /** Não foi possível estabelecer a chamada com segurança. */
    | "ENCRYPTION_FAILED"
    /** A conta do WhatsApp está restrita e não pode chamar. */
    | "ACCOUNT_RESTRICTED"
    /** A conta não tem permissão para chamar. */
    | "NO_CALL_PERMISSION"
    /** Algo deu errado do lado do servidor. */
    | "SERVER_ERROR";

/**
 * `UNKNOWN` é o motivo que esta versão da biblioteca ainda não conhece. Ele serve para o
 * log e para abrir uma issue, nunca para decidir o fluxo: o que aparecer com frequência
 * vira um código novo aqui.
 */
export type ErrorCode = DeviceErrorCode | CommandErrorCode | MediaErrorCode | CallFailureCode | "UNKNOWN";

export type WavoipError<C extends ErrorCode = ErrorCode> = {
    readonly code: C;
    /** Os valores que a mensagem do integrador precisa, como `{ min, max }`. */
    readonly details?: Record<string, unknown>;
    /** O valor bruto do protocolo ou da plataforma, só para diagnóstico. */
    readonly cause?: unknown;
};
