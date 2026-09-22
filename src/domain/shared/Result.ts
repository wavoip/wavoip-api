/**
 * O que um comando devolve: ou `data`, ou `error`, nunca os dois. Substitui os cinco
 * formatos que a biblioteca tinha (`{ call, err }`, `{ err }`, `boolean`, exceção…).
 */
export type Result<T, E extends WavoipError = WavoipError> =
    | { readonly data: T; readonly error: null }
    | { readonly data: null; readonly error: E };

export type WavoipError = {
    /** Estável: é nele que o integrador decide o fluxo, e é ele que ele traduz. */
    readonly code: string;
    /** Valor bruto do protocolo ou da plataforma, só para diagnóstico. */
    readonly cause?: unknown;
};

function ok(): Result<void>;
function ok<T>(data: T): Result<T>;
function ok<T>(data?: T): Result<T> {
    return { data: data as T, error: null };
}

function fail(code: string, cause?: unknown): Result<never> {
    return { data: null, error: { code, cause } };
}

export const Result = { ok, fail };
