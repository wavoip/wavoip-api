import type { MediaSocketFactory, MediaSocketLike } from "@/ports/runtime/MediaSocketPort";

/** O relay manda áudio binário; sem isto o navegador entrega Blob e o worklet não toca. */
export const webMediaSocket: MediaSocketFactory = (url) => {
    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    return socket as unknown as MediaSocketLike;
};
