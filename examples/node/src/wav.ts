import { readFileSync, writeFileSync } from "node:fs";

const HEADER_BYTES = 44;
const BITS_PER_SAMPLE = 16;

/**
 * Escreve um WAV mono de 16 bits a partir dos blocos de PCM que a chamada entregou.
 *
 * O cabeçalho é montado à mão porque são 44 bytes e uma dependência a menos: o que a chamada
 * devolve já é exatamente o corpo do arquivo, sem conversão nenhuma.
 */
export function writeWav(path: string, blocks: Int16Array[], sampleRate: number): void {
    writeSamples(path, flatten(blocks), sampleRate, 1);
}

/**
 * Escreve os dois lados da conversa em canais separados, que é como se grava uma chamada:
 * à esquerda quem atendeu, à direita o contato.
 *
 * Separados, e não misturados, porque assim dá para ouvir cada um sozinho depois — é o que
 * uma auditoria ou uma transcrição por interlocutor precisa.
 */
export function writeStereoWav(path: string, left: Int16Array[], right: Int16Array[], sampleRate: number): void {
    const a = flatten(left);
    const b = flatten(right);
    const frames = Math.max(a.length, b.length);

    const interleaved = new Int16Array(frames * 2);
    for (let i = 0; i < frames; i += 1) {
        interleaved[i * 2] = a[i] ?? 0;
        interleaved[i * 2 + 1] = b[i] ?? 0;
    }
    writeSamples(path, interleaved, sampleRate, 2);
}

function writeSamples(path: string, samples: Int16Array, sampleRate: number, channels: number): void {
    const file = Buffer.alloc(HEADER_BYTES + samples.length * 2);

    writeHeader(file, samples.length, sampleRate, channels);
    for (let i = 0; i < samples.length; i += 1) file.writeInt16LE(samples[i], HEADER_BYTES + i * 2);
    writeFileSync(path, file);
}

function flatten(blocks: Int16Array[]): Int16Array {
    const total = blocks.reduce((sum, block) => sum + block.length, 0);
    const whole = new Int16Array(total);
    let at = 0;
    for (const block of blocks) {
        whole.set(block, at);
        at += block.length;
    }
    return whole;
}

function writeHeader(file: Buffer, samples: number, sampleRate: number, channels: number): void {
    const bytesPerSecond = sampleRate * 2 * channels;
    file.write("RIFF", 0);
    file.writeUInt32LE(36 + samples * 2, 4);
    file.write("WAVEfmt ", 8);
    file.writeUInt32LE(16, 16); // tamanho do bloco de formato
    file.writeUInt16LE(1, 20); // 1 = PCM sem compressão
    file.writeUInt16LE(channels, 22);
    file.writeUInt32LE(sampleRate, 24);
    file.writeUInt32LE(bytesPerSecond, 28);
    file.writeUInt16LE(2 * channels, 32); // bytes por frame
    file.writeUInt16LE(BITS_PER_SAMPLE, 34);
    file.write("data", 36);
    file.writeUInt32LE(samples * 2, 40);
}

/** Um arquivo WAV lido: as amostras já em Int16, e o formato que o cabeçalho declara. */
export type WavFile = {
    readonly samples: Int16Array;
    readonly sampleRate: number;
    readonly channelCount: number;
};

/** O que o campo de formato do WAV diz: 1 é inteiro, 3 é ponto flutuante. */
const PCM_INTEGER = 1;
const PCM_FLOAT = 3;
const EXTENSIBLE = 0xfffe;

/**
 * Lê um WAV sem nenhuma dependência, em qualquer profundidade que o formato permite: 8, 16,
 * 24 e 32 bits inteiros, e 32 ou 64 bits em ponto flutuante.
 *
 * Todas viram Int16, que é o que a chamada usa. Aceitar só 16 bits seria mais curto e
 * recusaria arquivo que o gravador de qualquer celular produz.
 *
 * Os blocos do arquivo têm tamanho variável e nem sempre vêm na mesma ordem — alguns
 * gravadores põem metadados antes do áudio —, então o `data` é procurado em vez de presumido
 * num deslocamento fixo.
 */
export function readWav(path: string): WavFile {
    const file = readFileSync(path);
    if (file.toString("ascii", 0, 4) !== "RIFF" || file.toString("ascii", 8, 12) !== "WAVE") {
        throw new Error(
            `${path} não é um WAV. Um mp3, ogg ou m4a precisa ser decodificado antes: ` +
                `ffmpeg -i ${path} -c:a pcm_s16le saida.wav`,
        );
    }

    const format = findChunk(file, "fmt ");
    const data = findChunk(file, "data");
    const bytes = file.readUInt32LE(data - 4);

    return {
        samples: decode(file.subarray(data, data + bytes), encodingOf(file, format), path),
        sampleRate: file.readUInt32LE(format + 4),
        channelCount: file.readUInt16LE(format + 2),
    };
}

type Encoding = { readonly kind: number; readonly bits: number };

/**
 * O tipo e a profundidade das amostras.
 *
 * `WAVE_FORMAT_EXTENSIBLE` é o cabeçalho que gravadores modernos usam quando há muitos canais
 * ou mais de 16 bits: o tipo real fica escondido num sub-bloco, e ler o campo de fora daria
 * sempre `0xfffe`.
 */
function encodingOf(file: Buffer, format: number): Encoding {
    const declared = file.readUInt16LE(format);
    const bits = file.readUInt16LE(format + 14);
    if (declared !== EXTENSIBLE) return { kind: declared, bits };

    return { kind: file.readUInt16LE(format + 24), bits };
}

/** Cada profundidade tem a sua leitura; todas terminam em Int16, que é o da chamada. */
function decode(data: Buffer, { kind, bits }: Encoding, path: string): Int16Array {
    if (kind === PCM_FLOAT) return fromFloat(data, bits, path);
    if (kind !== PCM_INTEGER) {
        throw new Error(
            `${path} tem áudio comprimido dentro do WAV (formato ${kind}). ` +
                `Converta para PCM: ffmpeg -i ${path} -c:a pcm_s16le saida.wav`,
        );
    }

    if (bits === 8) return map(data.length, (i) => (data.readUInt8(i) - 128) << 8);
    if (bits === 16) return map(data.length >> 1, (i) => data.readInt16LE(i * 2));
    if (bits === 24) return map(Math.floor(data.length / 3), (i) => data.readIntLE(i * 3, 3) >> 8);
    if (bits === 32) return map(data.length >> 2, (i) => data.readInt32LE(i * 4) >> 16);

    throw new Error(`${path} tem ${bits} bits por amostra, que o exemplo não lê`);
}

function fromFloat(data: Buffer, bits: number, path: string): Int16Array {
    if (bits === 32) return map(data.length >> 2, (i) => toInt16(data.readFloatLE(i * 4)));
    if (bits === 64) return map(data.length >> 3, (i) => toInt16(data.readDoubleLE(i * 8)));
    throw new Error(`${path} é ponto flutuante de ${bits} bits, que o exemplo não lê`);
}

/** O float de áudio vive em -1..1; o que passar disso é estouro, e ceifar é o que se faz. */
function toInt16(value: number): number {
    return Math.max(-32_768, Math.min(32_767, Math.round(value * 32_767)));
}

function map(length: number, read: (index: number) => number): Int16Array {
    const samples = new Int16Array(length);
    for (let i = 0; i < length; i += 1) samples[i] = read(i);
    return samples;
}

/** O deslocamento do conteúdo do bloco, pulando os que vierem antes. */
function findChunk(file: Buffer, id: string): number {
    let at = 12;
    while (at + 8 <= file.length) {
        const size = file.readUInt32LE(at + 4);
        if (file.toString("ascii", at, at + 4) === id) return at + 8;
        at += 8 + size + (size % 2); // os blocos são alinhados em dois bytes
    }
    throw new Error(`o WAV não tem o bloco "${id}"`);
}
