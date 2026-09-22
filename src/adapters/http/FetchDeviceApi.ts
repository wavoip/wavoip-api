import { Result } from "@/domain/shared/Result";
import type { DeviceApiPort } from "@/ports/DeviceApiPort";

const DEVICE_API = "https://devices.wavoip.com";
const CENTRAL_API = "https://api.wavoip.com/v2";

/**
 * `fetch` em vez de axios: ele é nativo no navegador, no React Native, no Electron e no
 * Node 18+, e a biblioteca deixa de carregar uma dependência só para três GETs.
 */
export class FetchDeviceApi implements DeviceApiPort {
    constructor(private readonly token: string) {}

    restart(): Promise<Result<void>> {
        return this.get(`${DEVICE_API}/${this.token}/device/restart`);
    }

    logout(): Promise<Result<void>> {
        return this.get(`${DEVICE_API}/${this.token}/whatsapp/logout`);
    }

    /**
     * A rota central acorda o device pelo token, atualizando banco e serviços mesmo quando
     * o próprio device não consegue responder — o padrão que o client-website já usa.
     */
    wakeUp(): Promise<Result<void>> {
        return this.get(`${CENTRAL_API}/devices/${this.token}/wakeup`);
    }

    private async get(url: string): Promise<Result<void>> {
        try {
            const response = await fetch(url);
            if (!response.ok) return Result.fail(await readErrorCode(response));
            return Result.ok();
        } catch (e) {
            return Result.fail("NETWORK_ERROR", e);
        }
    }
}

/** O corpo de erro da API central traz um código; o da API do device, não. */
async function readErrorCode(response: Response): Promise<string> {
    const body: unknown = await response.json().catch(() => null);
    const code = (body as { code?: unknown; err?: unknown } | null)?.code;
    return typeof code === "string" ? code : `HTTP_${response.status}`;
}
