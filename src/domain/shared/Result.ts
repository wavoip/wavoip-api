import type { ErrorCode, WavoipError } from "@/domain/shared/errors";

/** What every command answers: either `data` or `error`, never both. */
export type Result<T, E extends WavoipError = WavoipError> =
    | { readonly data: T; readonly error: null }
    | { readonly data: null; readonly error: E };

// `never` no lugar do erro: um sucesso cabe em qualquer `Result`, seja qual for o
// subconjunto de códigos que o método declara poder falhar.
function ok(): Result<void, never>;
function ok<T>(data: T): Result<T, never>;
function ok<T>(data?: T): Result<T, never> {
    return { data: data as T, error: null };
}

function fail<C extends ErrorCode>(
    code: C,
    extra?: { details?: Record<string, unknown>; cause?: unknown },
): Result<never, WavoipError<C>> {
    return { data: null, error: { code, ...extra } };
}

export const Result = { ok, fail };
