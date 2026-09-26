import type { MediaSocketFactory, MediaSocketLike } from "@/ports/runtime/MediaSocketPort";

/**
 * O socket binário do relay a partir do `WebSocket` global.
 *
 * Mora em `platform/shared/` por não ser de uma plataforma só nem do núcleo: navegador e React
 * Native têm o mesmo `WebSocket` global, com a mesma forma, e os dois usam isto. O Node não
 * tem — e é por isso que ele traz o `ws`, cuja API de eventos é outra.
 *
 * O portão sem plataforma cobre `src/adapters/`, e foi ele que mostrou o endereço errado:
 * `WebSocket` não existe em todo runtime, então isto não é adaptador de núcleo.
 *
 * O `binaryType` é o detalhe que importa: sem ele o navegador entrega `Blob` e o worklet não
 * toca nada.
 */
export const globalMediaSocket: MediaSocketFactory = (url) => {
    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    return socket as unknown as MediaSocketLike;
};
