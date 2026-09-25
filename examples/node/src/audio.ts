import type { AudioSink, AudioSource } from "@wavoip/wavoip-api/node";

const CALL_RATE = 16_000;
const FRAME_MS = 10;

/**
 * Uma saudação sintetizada, para o exemplo não precisar de arquivo de áudio no repositório.
 *
 * São três notas seguidas de silêncio, em looping: dá para reconhecer no telefone que a
 * ligação foi atendida e que o áudio está chegando.
 */
export function greetingSource(): AudioSource {
    const notes = [440, 554, 659];
    const frames = buildGreeting(notes);
    let at = 0;
    let ticker: NodeJS.Timeout | null = null;

    return {
        // Sem `sampleRate`: já produzimos na taxa da chamada, então nada é reamostrado.
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

/** Guarda o que o contato falou, para o exemplo salvar em disco no fim da chamada. */
export function recordingSink(): AudioSink & { blocks: Int16Array[]; seconds: number } {
    const blocks: Int16Array[] = [];
    return {
        blocks,
        get seconds() {
            return blocks.reduce((total, block) => total + block.length, 0) / CALL_RATE;
        },
        write: (pcm) => void blocks.push(pcm.slice()),
        end: () => {},
    };
}

/** Três notas de 250 ms e meio segundo de silêncio, fatiados nos frames de 10 ms. */
function buildGreeting(notes: number[]): Int16Array[] {
    const perNote = CALL_RATE / 4;
    const whole = new Int16Array(perNote * notes.length + CALL_RATE / 2);

    notes.forEach((hz, index) => {
        for (let i = 0; i < perNote; i += 1) {
            whole[index * perNote + i] = Math.round(8_000 * Math.sin((2 * Math.PI * hz * i) / CALL_RATE));
        }
    });

    const size = (CALL_RATE * FRAME_MS) / 1000;
    const frames: Int16Array[] = [];
    for (let at = 0; at + size <= whole.length; at += size) frames.push(whole.subarray(at, at + size));
    return frames;
}
