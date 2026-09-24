import type { DeviceStatus } from "@/domain/device/Device";
import type { DeviceErrorCode } from "@/domain/shared/errors";

/**
 * As duas decisões do device que não dependem de nada externo, e por isso ficam aqui:
 * se ele pode chamar agora, e quando tentar reconectar.
 *
 * O teto de 3 tentativas dá duas de verdade (1s e 2s); passou disso, a conexão só volta
 * se o integrador chamar `connect()`. Quem conta o tempo é a sessão, que tem o timer.
 */
const MAX_RECONNECT_ATTEMPTS = 3;

/** O motivo de o device não poder chamar agora, ou `null` se ele pode. */
function canCall(status: DeviceStatus): DeviceErrorCode | null {
    if (status === "error") return "DEVICE_ERROR";
    if (status === "connecting") return "DEVICE_NOT_LINKED";
    if (status === "restarting") return "DEVICE_RESTARTING";
    return null;
}

function nextReconnectDelayMs(attempt: number): number | null {
    if (attempt >= MAX_RECONNECT_ATTEMPTS) return null;
    return attempt * 1_000;
}

export const DevicePolicy = { canCall, nextReconnectDelayMs };
