import type { ErrorCode, WavoipError } from "@/domain/shared/errors";

/**
 * O que um comando devolve: ou `data`, ou `error`, nunca os dois. Substitui os cinco
 * formatos que a biblioteca tinha (`{ call, err }`, `{ err }`, `boolean`, exceção…).
 */
export type Result<T, E extends WavoipError = WavoipError> =
    | { readonly data: T; readonly error: null }
    | { readonly data: null; readonly error: E };

function ok(): Result<void>;
function ok<T>(data: T): Result<T>;
function ok<T>(data?: T): Result<T> {
    return { data: data as T, error: null };
}

function fail<C extends ErrorCode>(
    code: C,
    extra?: { details?: Record<string, unknown>; cause?: unknown },
): Result<never, WavoipError<C>> {
    return { data: null, error: { code, ...extra } };
}

export const Result = { ok, fail };
