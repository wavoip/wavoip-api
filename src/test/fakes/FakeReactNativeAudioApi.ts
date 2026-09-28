/**
 * O `react-native-audio-api` é publicado com sintaxe que só o Metro transforma, então nos
 * testes ele é substituído inteiro. Este dublê registra o que a biblioteca pediu ao grafo de
 * áudio do aparelho: os blocos enfileirados, a captura iniciada, as taxas usadas.
 */
export class FakeAudioBuffer {
    readonly channels: Float32Array[];

    constructor(
        readonly numberOfChannels: number,
        readonly length: number,
        readonly sampleRate: number,
    ) {
        this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
    }

    getChannelData(channel: number): Float32Array {
        return this.channels[channel];
    }

    copyToChannel(source: Float32Array, channel: number): void {
        this.channels[channel].set(source);
    }
}

export class FakeQueueSource {
    readonly enqueued: FakeAudioBuffer[] = [];
    started = false;
    startedWith: { when: number; offset: number } | null = null;
    stopped = false;
    cleared = 0;
    connectedTo: unknown = null;
    onBufferEnded: ((event: { bufferId: string; isLastBufferInQueue: boolean }) => void) | null = null;
    /** Os ids ainda por tocar, na ordem em que entraram. */
    private readonly ids: string[] = [];

    enqueueBuffer(buffer: FakeAudioBuffer): string {
        const bufferId = `buffer-${this.enqueued.length + 1}`;
        this.enqueued.push(buffer);
        this.ids.push(bufferId);
        return bufferId;
    }

    /** O aparelho terminando de tocar o bloco mais antigo da fila. */
    endOldestBuffer(): void {
        const bufferId = this.ids.shift();
        if (!bufferId) return;
        this.onBufferEnded?.({ bufferId, isLastBufferInQueue: this.ids.length === 0 });
    }

    connect(destination: unknown): void {
        this.connectedTo = destination;
    }

    /**
     * A fila de verdade valida os dois argumentos e recusa offset negativo — inclusive o
     * `-1` que ela mesma usa como padrão. O dublê guarda o que recebeu para o teste cobrar.
     */
    start(when = -1, offset = -1): void {
        this.started = true;
        this.startedWith = { when, offset };
    }

    stop(): void {
        this.stopped = true;
    }

    clearBuffers(): void {
        this.cleared += 1;
    }
}

export class FakeAudioContext {
    static instances: FakeAudioContext[] = [];
    readonly destination = { id: "destination" };
    readonly queue = new FakeQueueSource();
    closed = false;

    /** O aparelho tem a taxa dele; quem pede outra recebe o que pediu, como no nativo. */
    readonly sampleRate: number;

    constructor(options?: { sampleRate?: number }) {
        this.sampleRate = options?.sampleRate ?? 48_000;
        FakeAudioContext.instances.push(this);
    }

    createBufferQueueSource(): FakeQueueSource {
        return this.queue;
    }

    createBuffer(channels: number, length: number, rate: number): FakeAudioBuffer {
        return new FakeAudioBuffer(channels, length, rate);
    }

    async close(): Promise<void> {
        this.closed = true;
    }
}

/** O gravador do aparelho: guarda o que foi pedido e deixa o teste empurrar áudio. */
export class FakeAudioRecorder {
    static instances: FakeAudioRecorder[] = [];
    /** A taxa que o próximo gravador vai gravar. `null` é obedecer ao que lhe pedirem. */
    static deliversAt: number | null = null;
    requested: { sampleRate: number; bufferLength: number; channelCount: number } | null = null;
    started = false;
    stopped = false;
    private readonly rate: number | null;
    private listener: ((event: { buffer: FakeAudioBuffer }) => void) | null = null;

    constructor() {
        this.rate = FakeAudioRecorder.deliversAt;
        FakeAudioRecorder.instances.push(this);
    }

    onAudioReady(
        options: { sampleRate: number; bufferLength: number; channelCount: number },
        callback: (event: { buffer: FakeAudioBuffer }) => void,
    ): void {
        this.requested = options;
        this.listener = callback;
    }

    clearOnAudioReady(): void {
        this.listener = null;
    }

    /**
     * Abrir o gravador já entrega o primeiro bloco, como no aparelho — é por ele que a
     * captura descobre em que taxa o aparelho de fato gravou.
     */
    async start(): Promise<void> {
        this.started = true;
        const asked = this.requested;
        if (asked) this.deliver(new Float32Array(asked.bufferLength), this.rate ?? asked.sampleRate);
    }

    async stop(): Promise<void> {
        this.stopped = true;
    }

    /** O aparelho entregando um bloco, na taxa que ele decidiu — não na que pedimos. */
    deliver(samples: Float32Array, sampleRate: number): void {
        this.deliverChannels([samples], sampleRate);
    }

    /** O mesmo, com mais de um canal: o gravador pode ignorar o mono que pedimos. */
    deliverChannels(channels: Float32Array[], sampleRate: number): void {
        const buffer = new FakeAudioBuffer(channels.length, channels[0].length, sampleRate);
        channels.forEach((samples, index) => buffer.copyToChannel(samples, index));
        this.listener?.({ buffer });
    }
}
