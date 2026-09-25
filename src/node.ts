/**
 * The Node.js entry point: everything the core exports, plus a runtime for a headless
 * process — a bot, an IVR, a recorder.
 *
 * ```ts
 * import { Wavoip, nodeRuntime } from "@wavoip/wavoip-api/node";
 *
 * const wavoip = new Wavoip({ tokens, runtime: nodeRuntime({ source, sink }) });
 * ```
 *
 * Needs `@roamhq/wrtc` and `ws` installed alongside it; both are optional peer dependencies,
 * so a browser install never pulls them.
 */
export * from "@/index";
export type { AudioSink, AudioSource } from "@/platform/node/audioIo";
export { nodeRuntime } from "@/platform/node/nodeRuntime";
