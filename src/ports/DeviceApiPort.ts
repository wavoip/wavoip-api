import type { Result } from "@/domain/shared/Result";

/**
 * O que a biblioteca pede por HTTP sobre um device. O adaptador escolhe a rota: o
 * `wakeUp` fala com a API central, que sabe acordar um device hibernado mesmo quando ele
 * não responde; o resto ainda fala com a API do próprio device.
 */
export interface DeviceApiPort {
    restart(): Promise<Result<void>>;
    logout(): Promise<Result<void>>;
    wakeUp(): Promise<Result<void>>;
}
