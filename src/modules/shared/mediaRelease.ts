/**
 * Liberar a mídia termina em `AudioContext.suspend()`, que pode não resolver nunca — o
 * aparelho de áudio sumindo no meio da chamada, por exemplo. Quando a mídia cai, o servidor
 * já confirmou o desfecho, então a resposta ao integrador não espera além deste teto: a
 * liberação segue sozinha e a interface não trava em "cancelando".
 */
export const MEDIA_RELEASE_TIMEOUT_MS = 2_000;

export function releaseMedia(release: () => Promise<void>, ms: number = MEDIA_RELEASE_TIMEOUT_MS): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        const settle = () => {
            clearTimeout(timer);
            resolve();
        };

        release().then(settle, settle);
    });
}
