import type { PeerConnectionFactory, PeerConnectionLike } from "@/ports/runtime/PeerConnectionPort";

/**
 * O `RTCPeerConnection` do navegador já tem a forma da porta; o cast existe porque o DOM
 * declara os eventos num mapa próprio, e não pelo nosso.
 */
export const webPeerConnection: PeerConnectionFactory = (config) =>
    new RTCPeerConnection({ iceServers: config.iceServers as RTCIceServer[] }) as unknown as PeerConnectionLike;
