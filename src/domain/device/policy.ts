import type { CallType } from "@/domain/call/types";
import type { DeviceStatus } from "@/domain/device/Device";
import type { DeviceErrorCode, WavoipError } from "@/domain/shared/errors";
import { Result } from "@/domain/shared/Result";

/**
 * As duas decisões do device que não dependem de nada externo, e por isso ficam aqui:
 * se ele pode chamar agora, e quando tentar reconectar.
 *
 * O teto de 3 tentativas dá duas de verdade (1s e 2s); passou disso, a conexão só volta
 * se o integrador chamar `connect()`. Quem conta o tempo é a sessão, que tem o timer.
 */
const MAX_RECONNECT_ATTEMPTS = 3;

/**
 * O tipo da próxima chamada que sai, ou o motivo de o device não poder chamar agora.
 *
 * Quem sai chamando escolhe o transporte pelo tipo, e o tipo só existe depois de o servidor
 * descrever o device. Deixar passar antes disso fazia a biblioteca chutar `OFFICIAL`, e o
 * chute errado só aparecia quando o outro lado atendia: a mídia subia em WebRTC num device
 * de relay e a chamada morria com a negociação falhando. `BUILDING` diz o mesmo pelo lado do
 * estado — o device pode voltar a construir depois de já ter se apresentado.
 */
function typeOfNextCall(
    status: DeviceStatus,
    callType: CallType | null,
): Result<CallType, WavoipError<DeviceErrorCode>> {
    if (callType === null || status === "BUILDING") return Result.fail("DEVICE_NOT_READY");
    if (status === "error") return Result.fail("DEVICE_ERROR");
    if (status === "connecting") return Result.fail("DEVICE_NOT_LINKED");
    if (status === "restarting") return Result.fail("DEVICE_RESTARTING");
    return Result.ok(callType);
}

function nextReconnectDelayMs(attempt: number): number | null {
    if (attempt >= MAX_RECONNECT_ATTEMPTS) return null;
    return attempt * 1_000;
}

export const DevicePolicy = { typeOfNextCall, nextReconnectDelayMs };
