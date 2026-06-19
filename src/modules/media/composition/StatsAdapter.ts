import type { CallStats } from "@/modules/call/Stats";

/**
 * StatsAdapter role — owns a single source of stats truth (WebRTC `pc.getStats`,
 * server-pushed `call:stats`, or client-side counters). The two-method shape
 * (`snapshot` + `refresh`) separates cheap cache reads from potentially-async
 * absorption.
 *
 * - `snapshot()` reads the current cached `CallStats`. Synchronous, allocation-free.
 *   Safe to call at any cadence the consumer chooses — including not at all.
 *
 * - `refresh()` repopulates the cache from the underlying source. WebRTC: invokes
 *   `pc.getStats()` and absorbs per-type entries. WebSocket: noop (server pushes
 *   keep cache up-to-date asynchronously) or a cheap counter recompute. Adapters
 *   that have no async work can `return Promise.resolve()`.
 *
 * `Call.getStats()` calls `await refresh(); return snapshot();` — the consumer
 * dictates cadence. No internal ticker.
 */
export interface IStatsAdapter {
    snapshot(): CallStats;
    refresh(): Promise<void>;
}
