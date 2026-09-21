import type { CallStats } from "@/modules/call/Stats";

/**
 * Dois métodos para separar a leitura barata do cache (`snapshot`, síncrona) da
 * absorção que pode ser assíncrona (`refresh`, que no WebRTC é o `pc.getStats()`).
 */
export interface IStatsAdapter {
    snapshot(): CallStats;
    refresh(): Promise<void>;
}
