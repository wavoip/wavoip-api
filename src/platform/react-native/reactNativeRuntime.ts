import { RNAudioDevices } from "@/platform/react-native/rnAudioDevices";
import { RNAudioEngine } from "@/platform/react-native/RNAudioEngine";
import { RNMicrophone } from "@/platform/react-native/RNMicrophone";
import { rnPeerConnection } from "@/platform/react-native/rnPeerConnection";
// O tipo vem de `@/index`, e não de `@/ports/...`, de propósito. A entrada desta plataforma
// faz `export * from "@/index"`, e o gerador de `.d.ts` trata o símbolo reexportado por ali
// como distinto do mesmo símbolo importado da origem: o resultado eram 23 tipos duplicados
// na superfície pública, com o runtime saindo como `WavoipRuntime_2`, que nem é exportado.
import type { WavoipRuntime } from "@/index";

/**
 * The React Native runtime: `react-native-webrtc` for the microphone and the connection, and
 * the platform's own audio routing for playback.
 *
 * ```ts
 * import { Wavoip } from "@wavoip/wavoip-api";
 * import { reactNativeRuntime } from "@wavoip/wavoip-api/react-native";
 *
 * const wavoip = new Wavoip({ tokens, runtime: reactNativeRuntime() });
 * ```
 *
 * **Official calls only, for now.** `openSocket` is deliberately absent: the unofficial call
 * carries raw PCM, which needs an audio engine this runtime does not have yet. Leaving it out
 * is what makes `startCall` refuse that call type up front, with a code, instead of failing
 * halfway through a conversation.
 *
 * Requires the New Architecture, and microphone permission declared by your app:
 * `RECORD_AUDIO` on Android, `NSMicrophoneUsageDescription` on iOS.
 */
export function reactNativeRuntime(): WavoipRuntime {
    const devices = new RNAudioDevices();

    return {
        engine: new RNAudioEngine(),
        microphone: new RNMicrophone(),
        audio: devices,
        createPeer: rnPeerConnection,
    };
}
