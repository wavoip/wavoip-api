import type { WavoipError } from "@/domain/shared/errors";
import type { Result } from "@/domain/shared/Result";

/**
 * A superfície v2 devolve `{ err }` com string. A v3 troca isso pelo `Result` inteiro
 * (spec da v3); até lá, as views traduzem aqui, num lugar só.
 */
export function toLegacy(result: Result<void>): { err: string | null } {
    return { err: result.error ? legacyMessage(result.error) : null };
}

/** Falha de mídia chegava como a mensagem da exceção; o resto, como o código do servidor. */
export function legacyMessage(error: WavoipError): string {
    if (!error.code.startsWith("MEDIA_")) return error.code;
    return error.cause instanceof Error ? error.cause.message : String(error.cause ?? error.code);
}
