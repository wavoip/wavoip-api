import type { AudioSink, AudioSource } from "@wavoip/wavoip-api/node";

/**
 * O formato de um áudio decodificado de MP3, que é o que um bot costuma ter à mão: 44,1 kHz,
 * estéreo, em Float32. Nenhuma das três coisas é o que a chamada usa.
 */
export const MP3_RATE = 44_100;
export const MP3_CHANNELS = 2;

/** A taxa de uma gravação de estúdio, e a mais cara de produzir a partir dos 16 kHz da chamada. */
export const STUDIO_RATE = 48_000;

const FRAME_MS = 20;

/**
 * Uma saudação no formato mais desfavorável de propósito: Float32 estéreo a 44,1 kHz.
 *
 * O exemplo poderia gerar 16 kHz mono e não converter nada, mas aí não provaria coisa
 * alguma. Assim ele exercita o caminho inteiro — conversão de Float32, mistura dos canais e
 * reamostragem para baixo — que é o que acontece com quem toca um arquivo de verdade.
 */
export function mp3LikeSource(): AudioSource {
    const frames = buildGreeting();
    let at = 0;
    let ticker: NodeJS.Timeout | null = null;

    return {
        sampleRate: MP3_RATE,
        channelCount: MP3_CHANNELS,
        start(onFrame) {
            ticker = setInterval(() => {
                onFrame(frames[at % frames.length]);
                at += 1;
            }, FRAME_MS);
        },
        stop() {
            if (ticker) clearInterval(ticker);
            ticker = null;
        },
    };
}

/**
 * Grava em 48 kHz, que é a conversão mais cara do outro lado: cada segundo de chamada vira
 * três vezes mais amostras. Pedir 16 kHz aqui sairia de graça — e o exemplo quer o pior caso.
 */
export function studioSink(): AudioSink & { blocks: Int16Array[]; seconds: number } {
    const blocks: Int16Array[] = [];
    return {
        sampleRate: STUDIO_RATE,
        blocks,
        get seconds() {
            return blocks.reduce((total, block) => total + block.length, 0) / STUDIO_RATE;
        },
        write: (pcm) => void blocks.push(pcm.slice()),
        end: () => {},
    };
}

/** Três notas e meio segundo de silêncio, em Float32 estéreo, fatiados em blocos de 20 ms. */
function buildGreeting(): Float32Array[] {
    const notes = [440, 554, 659];
    const perNote = MP3_RATE / 4;
    const total = perNote * notes.length + MP3_RATE / 2;
    const whole = new Float32Array(total * MP3_CHANNELS);

    notes.forEach((hz, index) => {
        for (let i = 0; i < perNote; i += 1) {
            const value = 0.25 * Math.sin((2 * Math.PI * hz * i) / MP3_RATE);
            const at = (index * perNote + i) * MP3_CHANNELS;
            whole[at] = value;
            whole[at + 1] = value;
        }
    });

    const size = ((MP3_RATE * FRAME_MS) / 1000) * MP3_CHANNELS;
    const frames: Float32Array[] = [];
    for (let at = 0; at + size <= whole.length; at += size) frames.push(whole.subarray(at, at + size));
    return frames;
}
