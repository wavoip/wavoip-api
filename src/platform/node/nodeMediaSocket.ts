import type { MediaSocketFactory, MediaSocketLike } from "@/ports/runtime/MediaSocketPort";
import WebSocket from "ws";

/**
 * O socket binário do relay em Node. O `ws` não é o `WebSocket` do navegador: os eventos
 * chegam como argumentos soltos, e não num objeto — é o que esta ponte acerta.
 */
export const nodeMediaSocket: MediaSocketFactory = (url: string): MediaSocketLike => {
    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";

    return {
        get readyState(): number {
            return socket.readyState;
        },
        send: (data) => socket.send(data),
        close: () => socket.close(),
        addEventListener: (type, listener) => {
            if (type === "message") return void socket.on("message", (data) => listener({ data } as never));
            if (type === "close") return void socket.on("close", (code) => listener({ code } as never));
            socket.on(type, ((payload: unknown) => listener(payload as never)) as never);
        },
    };
};
