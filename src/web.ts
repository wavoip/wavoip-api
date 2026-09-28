/**
 * The browser entry point: everything the core exports, plus the runtime that implements
 * it with Web Audio, `getUserMedia`, `RTCPeerConnection` and `WebSocket`.
 *
 * ```ts
 * import { Wavoip, webRuntime } from "@wavoip/wavoip-api/web";
 *
 * const wavoip = new Wavoip({ tokens, runtime: webRuntime() });
 * ```
 *
 * Importing from here is what pulls the browser implementation into your bundle. A React
 * Native or Node app imports `@wavoip/wavoip-api` and its own runtime instead.
 */
export * from "@/index";
export { webRuntime } from "@/platform/web/webRuntime";
