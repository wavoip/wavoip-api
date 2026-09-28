/**
 * The React Native entry point: everything the core exports, plus the runtime backed by
 * `react-native-webrtc`.
 *
 * ```ts
 * import { Wavoip, reactNativeRuntime } from "@wavoip/wavoip-api/react-native";
 *
 * const wavoip = new Wavoip({ tokens, runtime: reactNativeRuntime() });
 * ```
 *
 * Needs `react-native-webrtc` installed alongside it; it is an optional peer dependency, so a
 * browser or Node install never pulls it.
 */
export * from "@/index";
export { reactNativeRuntime } from "@/platform/react-native/reactNativeRuntime";
