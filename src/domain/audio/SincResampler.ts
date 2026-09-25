/**
 * Reamostrador de razão arbitrária por sinc com janela, em JavaScript puro.
 *
 * É JS puro de propósito, e não o `libsamplerate`: o Hermes não tem WebAssembly, então um
 * reamostrador em WASM serviria ao Node e deixaria o React Native de fora. Aqui ele é regra
 * pura, mora no domínio e os dois usam o mesmo (DEV-277).
 *
 * O sinc é escalado pela razão de saída — é isso que faz o filtro anti-aliasing e a
 * reamostragem num passo só. Sem esse escalonamento, reduzir a taxa dobraria toda frequência
 * acima do novo Nyquist de volta para dentro da banda, e voz viraria ruído metálico.
 */
const HALF_TAPS = 16;
const INT16_MAX = 32_767;
const INT16_MIN = -32_768;

/**
 * O kernel é tabelado, e não calculado por amostra. Calcular `Math.sin` e `Math.cos` a cada
 * um dos 33 taps de cada amostra de saída custava ~12% de um core por chamada ativa: oito
 * chamadas saturavam o event loop de um processo Node e a voz começava a atrasar.
 *
 * Com a tabela, cada tap vira duas multiplicações e uma soma. A resolução é alta o bastante
 * para que a interpolação entre dois pontos vizinhos fique abaixo do passo de quantização do
 * Int16 — o mesmo caminho que o `libsamplerate` toma.
 */
const TABLE_RESOLUTION = 512;

export class SincResampler {
    private readonly step: number;
    private readonly table: Float32Array;
    private carry = new Float32Array(0);
    private position = HALF_TAPS;

    constructor(
        private readonly inputRate: number,
        private readonly outputRate: number,
    ) {
        if (inputRate <= 0 || outputRate <= 0) {
            throw new RangeError(`as taxas precisam ser positivas, e vieram ${inputRate} → ${outputRate}`);
        }
        this.step = inputRate / outputRate;
        this.table = tableFor(Math.min(1, outputRate / inputRate));
    }

    /** `true` quando não há nada a fazer e o PCM pode passar direto. */
    get isIdentity(): boolean {
        return this.inputRate === this.outputRate;
    }

    /**
     * Reamostra um pedaço e devolve o que já dá para produzir. O que falta de contexto à
     * direita fica guardado para a chamada seguinte — é o que faz a emenda entre frames não
     * estalar.
     */
    process(input: Int16Array): Int16Array {
        if (this.isIdentity) return input;

        const buffer = this.joinWithCarry(input);
        const output = this.resampleFrom(buffer);
        this.dropConsumed(buffer);
        return output;
    }

    /** Esquece o contexto: a próxima chamada começa como se fosse a primeira. */
    reset(): void {
        this.carry = new Float32Array(0);
        this.position = HALF_TAPS;
    }

    private joinWithCarry(input: Int16Array): Float32Array {
        const buffer = new Float32Array(this.carry.length + input.length);
        buffer.set(this.carry);
        for (let i = 0; i < input.length; i += 1) buffer[this.carry.length + i] = input[i];
        return buffer;
    }

    private resampleFrom(buffer: Float32Array): Int16Array {
        const samples: number[] = [];
        const last = buffer.length - HALF_TAPS - 1;

        for (; Math.floor(this.position) <= last; this.position += this.step) {
            samples.push(clampToInt16(this.interpolateAt(buffer)));
        }
        return Int16Array.from(samples);
    }

    /** Uma amostra de saída: a soma dos vizinhos pesados pelo kernel. */
    private interpolateAt(buffer: Float32Array): number {
        const center = Math.floor(this.position);
        const fraction = this.position - center;
        let sum = 0;

        for (let tap = -HALF_TAPS; tap <= HALF_TAPS; tap += 1) {
            const index = center + tap;
            if (index < 0 || index >= buffer.length) continue;
            sum += buffer[index] * this.weightAt(tap - fraction);
        }
        return sum;
    }

    /** O peso do kernel a esta distância, lido da tabela e interpolado entre dois vizinhos. */
    private weightAt(distance: number): number {
        // O kernel é par: o lado negativo é o espelho do positivo, e a tabela guarda um só.
        const exact = Math.abs(distance) * TABLE_RESOLUTION;
        const index = exact | 0;
        if (index >= this.table.length - 1) return 0;

        const fraction = exact - index;
        return this.table[index] + (this.table[index + 1] - this.table[index]) * fraction;
    }

    /** Guarda só o contexto que a próxima amostra ainda vai precisar ler. */
    private dropConsumed(buffer: Float32Array): void {
        const keepFrom = Math.max(0, Math.floor(this.position) - HALF_TAPS);
        this.carry = buffer.slice(keepFrom);
        this.position -= keepFrom;
    }
}

/**
 * O kernel de um corte, tabelado: sinc na frequência de corte, suavizado por Blackman.
 *
 * Só o lado positivo é guardado, porque o kernel é par. Montar a tabela custa alguns
 * milhares de operações uma vez por chamada, contra milhões por segundo se fosse calculado
 * na hora.
 */
function tableFor(cutoff: number): Float32Array {
    const table = new Float32Array(HALF_TAPS * TABLE_RESOLUTION + 2);
    for (let i = 0; i < table.length; i += 1) {
        const distance = i / TABLE_RESOLUTION;
        table[i] = cutoff * sinc(cutoff * distance) * blackman(distance);
    }
    return table;
}

function sinc(x: number): number {
    if (x === 0) return 1;
    const scaled = Math.PI * x;
    return Math.sin(scaled) / scaled;
}

/** Janela de Blackman sobre a largura do kernel: corta o vazamento das bordas. */
function blackman(distance: number): number {
    const phase = (Math.PI * (distance + HALF_TAPS)) / HALF_TAPS;
    return 0.42 - 0.5 * Math.cos(phase) + 0.08 * Math.cos(2 * phase);
}

function clampToInt16(sample: number): number {
    return Math.max(INT16_MIN, Math.min(INT16_MAX, Math.round(sample)));
}
