import type { PeerConnectionFactory, PeerConnectionLike } from "@/ports/runtime/PeerConnectionPort";
import { RTCPeerConnection } from "react-native-webrtc";

/**
 * O `RTCPeerConnection` do react-native-webrtc tem a mesma forma da porta — é a mesma
 * especificação, implementada em nativo. O cast é pelo mapa de eventos, igual ao do
 * navegador e ao do Node.
 */
export const rnPeerConnection: PeerConnectionFactory = (config) =>
    new RTCPeerConnection({ iceServers: config.iceServers }) as unknown as PeerConnectionLike;
