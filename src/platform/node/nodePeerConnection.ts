import type { PeerConnectionFactory, PeerConnectionLike } from "@/ports/runtime/PeerConnectionPort";
import { RTCPeerConnection } from "@/platform/node/wrtc";

/**
 * O `RTCPeerConnection` do wrtc tem a mesma forma da porta — é uma implementação nativa da
 * mesma especificação. O cast é pelo mapa de eventos, igual ao do navegador.
 */
export const nodePeerConnection: PeerConnectionFactory = (config) =>
    new RTCPeerConnection({ iceServers: config.iceServers as RTCIceServer[] }) as unknown as PeerConnectionLike;
