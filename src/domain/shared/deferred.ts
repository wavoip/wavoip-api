/** Uma promessa cujo desfecho quem resolve é outro trecho de código, e não o construtor. */
export type Deferred<T> = {
    readonly promise: Promise<T>;
    resolve(value: T): void;
    reject(reason?: unknown): void;
};

/**
 * O mesmo que `Promise.withResolvers`, que é ES2024 e o build não rebaixa: usá-lo direto
 * quebraria a chamada OFFICIAL em runtime anterior a Chrome 119, Firefox 121 ou Safari 17.4.
 * Um polyfill escreveria num global de quem integra, e o pacote declara `sideEffects: false`.
 */
function of<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

export const Deferred = { of };
