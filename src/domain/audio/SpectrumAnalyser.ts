/**
 * O espectro de frequências de um PCM, por FFT, em JavaScript puro.
 *
 * Existe porque o contrato de `call.audio.in.spectrum()` vale para toda plataforma onde o
 * áudio realmente passa pelo processo — e num Node sem cabeça ele passa. Devolver vazio ali
 * seria conveniência, não limitação. É JS puro pelo mesmo motivo do reamostrador: o Hermes
 * não tem WebAssembly, então o React Native herda isto quando ganhar um motor de áudio.
 *
 * A transformada é calculada quando alguém pede as bandas, e não a cada frame que chega: quem
 * não desenha nada não paga por isso.
 */
const DEFAULT_SIZE = 512;
const INT16_SCALE = 32_768;
const FLOOR_DB = -90;

export class SpectrumAnalyser {
    private readonly window: Float32Array;
    private readonly samples: Float32Array;
    private filled = 0;

    constructor(private readonly size: number = DEFAULT_SIZE) {
        if (!isPowerOfTwo(size)) throw new RangeError(`o tamanho da FFT tem de ser potência de dois, e veio ${size}`);
        this.samples = new Float32Array(size);
        this.window = hann(size);
    }

    /** Guarda o mais recente: o que passou de `size` amostras atrás não interessa mais. */
    push(pcm: Int16Array): void {
        if (pcm.length >= this.size) {
            const tail = pcm.subarray(pcm.length - this.size);
            for (let i = 0; i < this.size; i += 1) this.samples[i] = tail[i] / INT16_SCALE;
            this.filled = this.size;
            return;
        }

        this.samples.copyWithin(0, pcm.length);
        for (let i = 0; i < pcm.length; i += 1) this.samples[this.size - pcm.length + i] = pcm[i] / INT16_SCALE;
        this.filled = Math.min(this.size, this.filled + pcm.length);
    }

    /** Uma banda por byte, da grave à aguda, como o `AnalyserNode` do navegador entrega. */
    bands(): Uint8Array {
        if (this.filled < this.size) return new Uint8Array(0);

        const real = Float32Array.from(this.samples, (sample, i) => sample * this.window[i]);
        const imaginary = new Float32Array(this.size);
        transform(real, imaginary);

        const half = this.size / 2;
        const bands = new Uint8Array(half);
        for (let i = 0; i < half; i += 1) {
            bands[i] = toByte(Math.sqrt(real[i] * real[i] + imaginary[i] * imaginary[i]) / half);
        }
        return bands;
    }
}

/** FFT de Cooley-Tukey, no lugar: reordena por bit e combina de par em par. */
function transform(real: Float32Array, imaginary: Float32Array): void {
    const n = real.length;
    reorder(real, imaginary);

    for (let span = 2; span <= n; span *= 2) {
        const step = (-2 * Math.PI) / span;
        for (let start = 0; start < n; start += span) {
            for (let k = 0; k < span / 2; k += 1) {
                const angle = step * k;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const even = start + k;
                const odd = even + span / 2;

                const realOdd = real[odd] * cos - imaginary[odd] * sin;
                const imagOdd = real[odd] * sin + imaginary[odd] * cos;

                real[odd] = real[even] - realOdd;
                imaginary[odd] = imaginary[even] - imagOdd;
                real[even] += realOdd;
                imaginary[even] += imagOdd;
            }
        }
    }
}

/** A FFT no lugar exige as amostras na ordem do índice com os bits invertidos. */
function reorder(real: Float32Array, imaginary: Float32Array): void {
    const n = real.length;
    for (let i = 1, j = 0; i < n; i += 1) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i >= j) continue;

        [real[i], real[j]] = [real[j], real[i]];
        [imaginary[i], imaginary[j]] = [imaginary[j], imaginary[i]];
    }
}

/** Janela de Hann: sem ela, o corte do bloco vira energia espalhada por todas as bandas. */
function hann(size: number): Float32Array {
    return Float32Array.from({ length: size }, (_, i) => 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1))));
}

/** Decibéis, e não amplitude: é a escala que o `AnalyserNode` usa e que o olho espera. */
function toByte(magnitude: number): number {
    if (magnitude <= 0) return 0;
    const db = 20 * Math.log10(magnitude);
    if (db <= FLOOR_DB) return 0;
    return Math.min(255, Math.round((1 - db / FLOOR_DB) * 255));
}

function isPowerOfTwo(value: number): boolean {
    return value > 0 && (value & (value - 1)) === 0;
}
