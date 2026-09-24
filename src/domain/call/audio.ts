/**
 * Quem mede o áudio de um lado da chamada. Hoje só o nível; forma de onda e espectro
 * entram aqui quando forem pedidos, e valem para as duas direções de graça.
 */
export type AudioAnalyser = {
    /** O nível do áudio agora, de 0 a 1. Síncrono, para ler num `requestAnimationFrame`. */
    level(): number;
};

export type CallAudio = {
    /** O que chega do outro lado. */
    readonly in: AudioAnalyser;
    /** O que sai do microfone. */
    readonly out: AudioAnalyser;
};

const SILENT: AudioAnalyser = { level: () => 0 };

/** O que uma chamada sem mídia responde: zero, e não erro. */
function silent(): CallAudio {
    return { in: SILENT, out: SILENT };
}

export const CallAudio = { silent };
