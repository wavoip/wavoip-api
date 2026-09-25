import { RNAudioDevices } from "@/platform/react-native/rnAudioDevices";
import { RNAudioEngine } from "@/platform/react-native/RNAudioEngine";
import { RNMicrophone } from "@/platform/react-native/RNMicrophone";
import { rnPeerConnection } from "@/platform/react-native/rnPeerConnection";
import { globalMediaSocket } from "@/platform/shared/globalMediaSocket";
// O tipo vem de `@/index`, e não de `@/ports/...`, de propósito. A entrada desta plataforma
// faz `export * from "@/index"`, e o gerador de `.d.ts` trata o símbolo reexportado por ali
// como distinto do mesmo símbolo importado da origem: o resultado eram 23 tipos duplicados
// na superfície pública, com o runtime saindo como `WavoipRuntime_2`, que nem é exportado.
import type { WavoipRuntime } from "@/index";

/**
 * The React Native runtime: `react-native-webrtc` for the microphone and the connection,
 * `react-native-audio-api` for the raw PCM the unofficial call needs, and the system's own
 * routing for playback.
 *
 * ```ts
 * import { Wavoip } from "@wavoip/wavoip-api";
 * import { reactNativeRuntime } from "@wavoip/wavoip-api/react-native";
 *
 * const wavoip = new Wavoip({ tokens, runtime: reactNativeRuntime() });
 * ```
 *
 * Both call types work. The unofficial one resamples the device's microphone down to the
 * 16kHz the relay speaks, in plain JavaScript, because Hermes has no WebAssembly.
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
        usesAudioDevices: true,
        createPeer: rnPeerConnection,
        openSocket: globalMediaSocket,
    };
}
