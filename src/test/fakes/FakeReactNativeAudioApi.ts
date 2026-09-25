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
    stopped = false;
    cleared = 0;
    connectedTo: unknown = null;
    onBufferEnded: ((event: unknown) => void) | null = null;

    enqueueBuffer(buffer: FakeAudioBuffer): string {
        this.enqueued.push(buffer);
        return `buffer-${this.enqueued.length}`;
    }

    connect(destination: unknown): void {
        this.connectedTo = destination;
    }

    start(): void {
        this.started = true;
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

    constructor(readonly sampleRate = 48_000) {
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
    requested: { sampleRate: number; bufferLength: number; channelCount: number } | null = null;
    started = false;
    stopped = false;
    private listener: ((event: { buffer: FakeAudioBuffer }) => void) | null = null;

    constructor() {
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

    async start(): Promise<void> {
        this.started = true;
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
