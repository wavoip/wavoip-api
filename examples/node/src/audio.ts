import { fileURLToPath } from "node:url";
import type { AudioSink, AudioSource } from "@wavoip/wavoip-api/node";
import { readWav } from "./wav.ts";

/** O áudio que acompanha o exemplo, para o resultado poder ser julgado de ouvido. */
const SAMPLE = fileURLToPath(new URL("../audio/exemplo.wav", import.meta.url));

/** A taxa de uma gravação de estúdio, e a mais cara de produzir a partir dos 16 kHz da chamada. */
export const STUDIO_RATE = 48_000;

const FRAME_MS = 20;

/**
 * Toca o arquivo em looping, no formato em que ele está.
 *
 * O arquivo é 44,1 kHz estéreo e a chamada usa 16 kHz mono: há mistura de canais e
 * reamostragem para baixo no caminho, numa razão que não é inteira — o caso que mais exige
 * do reamostrador. A fonte não converte nada: ela declara o formato e entrega as amostras
 * como estão.
 */
export function greetingSource(path = SAMPLE): AudioSource {
    const wav = readWav(path);
    // As amostras de um arquivo estéreo vêm intercaladas, uma de cada canal: um frame de
    // 20 ms tem o dobro delas. Sem multiplicar pelos canais, o exemplo entregaria metade do
    // áudio por tique e a voz sairia na metade da velocidade.
    const perFrame = ((wav.sampleRate * FRAME_MS) / 1000) * wav.channelCount;
    const frames = sliceFrames(wav.samples, perFrame);
    let at = 0;
    let ticker: NodeJS.Timeout | null = null;

    return {
        sampleRate: wav.sampleRate,
        channelCount: wav.channelCount,
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

function sliceFrames(samples: Int16Array, size: number): Int16Array[] {
    const frames: Int16Array[] = [];
    for (let at = 0; at + size <= samples.length; at += size) frames.push(samples.subarray(at, at + size));
    return frames;
}
