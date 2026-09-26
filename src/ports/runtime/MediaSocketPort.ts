export const SOCKET_OPEN = 1;

export type MediaSocketEvents = {
    open: unknown;
    error: unknown;
    message: { data: unknown };
    close: { code: number };
};

/**
 * The relay's binary WebSocket. What changes between platforms is who creates it, not the
 * shape: React Native ships the same global the browser does.
 */
export interface MediaSocketLike {
    readonly readyState: number;
    send(data: ArrayBuffer | string): void;
    close(): void;
    addEventListener<E extends keyof MediaSocketEvents>(type: E, listener: (event: MediaSocketEvents[E]) => void): void;
}

export type MediaSocketFactory = (url: string) => MediaSocketLike;
