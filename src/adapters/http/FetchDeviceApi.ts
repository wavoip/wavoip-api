import { Config } from "@/config/config";
import type { DeviceApiFailure, DeviceErrorCode } from "@/domain/shared/errors";
import { Result } from "@/domain/shared/Result";
import type { DeviceApiPort } from "@/ports/DeviceApiPort";

/**
 * `fetch` em vez de axios: ele é nativo no navegador, no React Native, no Electron e no
 * Node 18+, e a biblioteca deixa de carregar uma dependência só para três GETs.
 */
export class FetchDeviceApi implements DeviceApiPort {
    constructor(private readonly token: string) {}

    restart(): Promise<Result<void, DeviceApiFailure>> {
        return this.get(`${Config.devicesUrl}/${this.token}/device/restart`);
    }

    logout(): Promise<Result<void, DeviceApiFailure>> {
        return this.get(`${Config.devicesUrl}/${this.token}/whatsapp/logout`);
    }

    /**
     * A rota central acorda o device pelo token, atualizando banco e serviços mesmo quando
     * o próprio device não consegue responder — o padrão que o client-website já usa.
     *
     * Responde 200 tanto para `DEVICE_WAKING_UP` quanto para `DEVICE_NOT_HIBERNATING`:
     * acordar quem já está acordado não é erro. Falha mesmo é 404 `DEVICE_NOT_FOUND`,
     * 409 `DEVICE_DISABLED`, 429 `WAKE_UP_RATE_LIMITED` e os 5xx de infraestrutura.
     */
    wakeUp(): Promise<Result<void, DeviceApiFailure>> {
        return this.get(`${Config.apiUrl}/v2/devices/${this.token}/wakeup`);
    }

    private async get(url: string): Promise<Result<void, DeviceApiFailure>> {
        try {
            const response = await fetch(url);
            if (!response.ok) return failureOf(response);
            return Result.ok();
        } catch (cause) {
            return Result.fail("NETWORK_ERROR", { cause });
        }
    }
}

/**
 * O corpo de erro da API central traz um código; o da API do device, não — e aí sobra o
 * status HTTP, que vai no `cause`.
 */
const HTTP_CODES: Record<string, DeviceErrorCode> = {
    DEVICE_NOT_FOUND: "DEVICE_NOT_FOUND",
    WAKE_UP_RATE_LIMITED: "WAKE_UP_RATE_LIMITED",
    DEVICE_DISABLED: "DEVICE_ERROR",
    DEVICE_INVALID_STATE_TRANSITION: "DEVICE_ERROR",
};

async function failureOf(response: Response): Promise<Result<never, DeviceApiFailure>> {
    const body: unknown = await response.json().catch(() => null);
    const raw = (body as { code?: unknown } | null)?.code;
    const code = typeof raw === "string" ? HTTP_CODES[raw] : undefined;
    if (code) return Result.fail(code, { cause: raw });
    return Result.fail("UNKNOWN", { cause: raw ?? `HTTP_${response.status}` });
}
