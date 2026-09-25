import { writeFileSync } from "node:fs";

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
