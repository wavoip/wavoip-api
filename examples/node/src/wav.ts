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
    const samples = blocks.reduce((total, block) => total + block.length, 0);
    const file = Buffer.alloc(HEADER_BYTES + samples * 2);

    writeHeader(file, samples, sampleRate);
    let at = HEADER_BYTES;
    for (const block of blocks) {
        for (const sample of block) {
            file.writeInt16LE(sample, at);
            at += 2;
        }
    }
    writeFileSync(path, file);
}

function writeHeader(file: Buffer, samples: number, sampleRate: number): void {
    const bytesPerSecond = sampleRate * 2;
    file.write("RIFF", 0);
    file.writeUInt32LE(36 + samples * 2, 4);
    file.write("WAVEfmt ", 8);
    file.writeUInt32LE(16, 16); // tamanho do bloco de formato
    file.writeUInt16LE(1, 20); // 1 = PCM sem compressão
    file.writeUInt16LE(1, 22); // mono
    file.writeUInt32LE(sampleRate, 24);
    file.writeUInt32LE(bytesPerSecond, 28);
    file.writeUInt16LE(2, 32); // bytes por amostra
    file.writeUInt16LE(BITS_PER_SAMPLE, 34);
    file.write("data", 36);
    file.writeUInt32LE(samples * 2, 40);
}

/** Um arquivo WAV lido: as amostras e o formato que o cabeçalho declara. */
export type WavFile = {
    readonly samples: Int16Array;
    readonly sampleRate: number;
    readonly channelCount: number;
};

/**
 * Lê um WAV de 16 bits sem nenhuma dependência.
 *
 * Os blocos do arquivo têm tamanho variável e nem sempre vêm na mesma ordem — alguns
 * gravadores põem metadados antes do áudio —, então o `data` é procurado em vez de presumido
 * num deslocamento fixo.
 */
export function readWav(path: string): WavFile {
    const file = readFileSync(path);
    if (file.toString("ascii", 0, 4) !== "RIFF" || file.toString("ascii", 8, 12) !== "WAVE") {
        throw new Error(`${path} não é um arquivo WAV`);
    }

    const format = findChunk(file, "fmt ");
    const bits = file.readUInt16LE(format + 14);
    if (bits !== 16) throw new Error(`${path} tem ${bits} bits por amostra; o exemplo lê 16`);

    const data = findChunk(file, "data");
    const bytes = file.readUInt32LE(data - 4);
    const samples = new Int16Array(bytes >> 1);
    for (let i = 0; i < samples.length; i += 1) samples[i] = file.readInt16LE(data + i * 2);

    return { samples, sampleRate: file.readUInt32LE(format + 4), channelCount: file.readUInt16LE(format + 2) };
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
