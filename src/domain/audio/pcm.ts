const INT16_MAX = 32_767;
const INT16_MIN = -32_768;

/**
 * Converte o que o integrador empurra para o formato que a biblioteca usa por dentro:
 * Int16, mono.
 *
 * Float32 entra porque é o que quase toda fonte de áudio de plataforma entrega — o Web
 * Audio, o `AudioRecorder` do React Native, a maioria dos decodificadores. Exigir Int16
 * faria todo integrador escrever a mesma multiplicação.
 */
function toInt16(frame: Int16Array | Float32Array): Int16Array {
    if (frame instanceof Int16Array) return frame;

    const pcm = new Int16Array(frame.length);
    for (let i = 0; i < frame.length; i += 1) {
        // O Float32 de áudio vive em -1..1; o que passar disso é estouro, e ceifar é o que
        // um conversor faz — dobrar viraria estalo.
        pcm[i] = Math.max(INT16_MIN, Math.min(INT16_MAX, Math.round(frame[i] * INT16_MAX)));
    }
    return pcm;
}

/** Mistura canais intercalados num só, pela média — estéreo vira mono sem perder volume. */
function downmix(frame: Int16Array, channelCount: number): Int16Array {
    if (channelCount <= 1) return frame;

    const frames = Math.floor(frame.length / channelCount);
    const mono = new Int16Array(frames);
    for (let i = 0; i < frames; i += 1) {
        let sum = 0;
        for (let channel = 0; channel < channelCount; channel += 1) sum += frame[i * channelCount + channel];
        mono[i] = Math.round(sum / channelCount);
    }
    return mono;
}

export const Pcm = { toInt16, downmix };
