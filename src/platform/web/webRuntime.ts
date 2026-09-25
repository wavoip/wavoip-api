import { WebAudioDevices } from "@/platform/web/WebAudioDevices";
// O tipo vem de `@/index`, e não de `@/ports/...`, de propósito. A entrada desta plataforma
// faz `export * from "@/index"`, e o gerador de `.d.ts` trata o símbolo reexportado por ali
// como distinto do mesmo símbolo importado da origem: o resultado eram 23 tipos duplicados
// na superfície pública, com o runtime saindo como `WavoipRuntime_2`, que nem é exportado.
import type { WavoipRuntime } from "@/index";
import { WebAudioEngine } from "@/platform/web/WebAudioEngine";
import { globalMediaSocket } from "@/platform/shared/globalMediaSocket";
import { webPeerConnection } from "@/platform/web/webPeerConnection";

/** The browser runtime: Web Audio, `getUserMedia`, `RTCPeerConnection` and `WebSocket`. */
export function webRuntime(): WavoipRuntime {
    // O `WebAudioDevices` é o microfone e a lista de aparelhos do navegador; o motor é dele.
    const media = new WebAudioDevices(new WebAudioEngine());

    return {
        engine: media.engine,
        microphone: media,
        audio: media,
        usesAudioDevices: true,
        createPeer: webPeerConnection,
        openSocket: globalMediaSocket,
    };
}
