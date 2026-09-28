import type { CallFailureCode, WavoipError } from "@/domain/shared/errors";

/**
 * A tradução do motivo que o servidor manda no `call:failed` para o vocabulário da
 * biblioteca. Fonte do lado de lá: o `Helper.mapError` do whatsapp_instance.
 *
 * Os nomes `TX` e `RX` do servidor são do ponto de vista do motor de VoIP e enganam quem
 * os lê de fora: `PEER_TX_TIMEOUT` é o motor sem áudio **nosso** para transmitir, e
 * `PEER_RX_TIMEOUT` é o áudio que parou de chegar **do contato**. Conferido no código do
 * UWP; o JSDoc da v2 descrevia os dois ao contrário.
 */
const FROM_SERVER: Record<string, CallFailureCode> = {
    PEER_TX_TIMEOUT: "LOCAL_AUDIO_TIMEOUT",
    AUDIO_TIMEOUT: "LOCAL_AUDIO_TIMEOUT",
    PEER_RX_TIMEOUT: "REMOTE_AUDIO_TIMEOUT",
    CONNECTION_TIMEOUT: "CONNECTION_TIMEOUT",
    CORRUPTED_KEYS: "ENCRYPTION_FAILED",
    ACCOUNT_RESTRICTED: "ACCOUNT_RESTRICTED",
    NO_CALL_PERMISSION: "NO_CALL_PERMISSION",
    INTERNAL_ERROR: "SERVER_ERROR",
};

function fromServer(reason: string): WavoipError<CallFailureCode | "UNKNOWN"> {
    const code = FROM_SERVER[reason];
    if (!code) return { code: "UNKNOWN", cause: reason };
    return { code };
}

export const CallFailure = { fromServer };
