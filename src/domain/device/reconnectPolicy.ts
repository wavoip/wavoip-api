/**
 * Quando e se tentar de novo depois que o socket cai. O teto de 3 dá duas tentativas
 * reais (1s e 2s); passou disso, a conexão só volta se o integrador chamar `connect()`.
 *
 * Puro de propósito: quem conta o tempo é a sessão, que tem o timer.
 */
const MAX_ATTEMPTS = 3;

function nextDelayMs(attempt: number): number | null {
    if (attempt >= MAX_ATTEMPTS) return null;
    return attempt * 1_000;
}

export const ReconnectPolicy = { nextDelayMs };
