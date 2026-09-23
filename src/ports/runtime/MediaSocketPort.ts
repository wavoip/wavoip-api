/**
 * O WebSocket binário do relay. O React Native tem o mesmo global, então o adaptador web
 * serve aos dois; o que muda de plataforma é quem o cria.
 */
export const SOCKET_OPEN = 1;

export type MediaSocketEvents = {
    open: unknown;
    error: unknown;
    message: { data: unknown };
    close: { code: number };
};

export interface MediaSocketLike {
    readonly readyState: number;
    send(data: ArrayBuffer | string): void;
    close(): void;
    addEventListener<E extends keyof MediaSocketEvents>(type: E, listener: (event: MediaSocketEvents[E]) => void): void;
}

export type MediaSocketFactory = (url: string) => MediaSocketLike;
