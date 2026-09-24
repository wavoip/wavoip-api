import { MediaManager } from "@/modules/media/MediaManager";
import type { WavoipRuntime } from "@/ports/WavoipRuntime";
import { WebAudioEngine } from "@/platform/web/WebAudioEngine";
import { webMediaSocket } from "@/platform/web/webMediaSocket";
import { webPeerConnection } from "@/platform/web/webPeerConnection";

/** The browser runtime: Web Audio, `getUserMedia`, `RTCPeerConnection` and `WebSocket`. */
export function webRuntime(): WavoipRuntime {
    // O `MediaManager` é o microfone e a lista de aparelhos do navegador; o motor é dele.
    const media = new MediaManager(new WebAudioEngine());

    return {
        engine: media.engine,
        microphone: media,
        audio: media,
        createPeer: webPeerConnection,
        openSocket: webMediaSocket,
    };
}
