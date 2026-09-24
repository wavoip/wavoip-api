import { WebAudioDevices } from "@/platform/web/WebAudioDevices";
import type { WavoipRuntime } from "@/ports/WavoipRuntime";
import { WebAudioEngine } from "@/platform/web/WebAudioEngine";
import { webMediaSocket } from "@/platform/web/webMediaSocket";
import { webPeerConnection } from "@/platform/web/webPeerConnection";

/** The browser runtime: Web Audio, `getUserMedia`, `RTCPeerConnection` and `WebSocket`. */
export function webRuntime(): WavoipRuntime {
    // O `WebAudioDevices` é o microfone e a lista de aparelhos do navegador; o motor é dele.
    const media = new WebAudioDevices(new WebAudioEngine());

    return {
        engine: media.engine,
        microphone: media,
        audio: media,
        createPeer: webPeerConnection,
        openSocket: webMediaSocket,
    };
}
