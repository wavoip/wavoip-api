import type { PcmConverter } from "@/platform/node/PcmConverter";
import { Worker } from "node:worker_threads";

/** O bundle do worker fica ao lado deste arquivo no `dist`. */
const WORKER_FILE = "node-worker.mjs";

type FromWorker = { readonly id: number; readonly pcm: ArrayBuffer };

/**
 * Um worker só para todo o processo, porque o custo de um thread não se paga por chamada: o
 * que se ganha é tirar a reamostragem do event loop, e um thread já faz isso para todas.
 *
 * Os fluxos se distinguem por um id, e cada um tem o seu reamostrador do outro lado.
 */
class ResampleThread {
    private worker: Worker | null = null;
    private readonly waiting = new Map<number, (pcm: Int16Array) => void>();
    private nextId = 1;
    private users = 0;

    /** Sobe o thread, ou devolve `null` se este ambiente não consegue carregá-lo. */
    open(inputRate: number, outputRate: number): number | null {
        const worker = this.ensureWorker();
        if (!worker) return null;

        const id = this.nextId++;
        this.users += 1;
        worker.postMessage({ type: "open", id, inputRate, outputRate });
        return id;
    }

    send(id: number, pcm: Int16Array, emit: (converted: Int16Array) => void): void {
        this.waiting.set(id, emit);
        const copy = new Int16Array(pcm);
        this.worker?.postMessage({ type: "convert", id, pcm: copy.buffer }, [copy.buffer]);
    }

    reset(id: number): void {
        this.worker?.postMessage({ type: "reset", id });
    }

    close(id: number): void {
        this.worker?.postMessage({ type: "close", id });
        this.waiting.delete(id);
        this.users -= 1;
        if (this.users <= 0) this.shutdown();
    }

    private ensureWorker(): Worker | null {
        if (this.worker) return this.worker;
        try {
            this.worker = new Worker(new URL(WORKER_FILE, import.meta.url));
            this.worker.on("message", (message: FromWorker) => this.deliver(message));
            // O `unref` vem depois do listener, e não antes: escutar `message` volta a
            // segurar o event loop, e um bot que acabou o trabalho ficaria pendurado no
            // thread sem nunca sair. Enquanto há chamada, quem mantém o processo vivo são os
            // sockets e os timers dela.
            this.worker.unref();
            return this.worker;
        } catch {
            return null;
        }
    }

    private deliver({ id, pcm }: FromWorker): void {
        this.waiting.get(id)?.(new Int16Array(pcm));
    }

    private shutdown(): void {
        void this.worker?.terminate();
        this.worker = null;
        this.waiting.clear();
        this.users = 0;
    }
}

const thread = new ResampleThread();

/**
 * Reamostra em outro thread. O resultado volta por mensagem, então chega depois — o que o
 * caminho do áudio tolera, porque a entrega já é por callback.
 *
 * `WorkerConverter.Open` devolve `null` onde o worker não pode ser carregado, e aí quem chama
 * fica no conversor local: é melhor reamostrar no event loop do que não reamostrar.
 */
export class WorkerConverter implements PcmConverter {
    private constructor(private readonly id: number) {}

    static Open(inputRate: number, outputRate: number): WorkerConverter | null {
        const id = thread.open(inputRate, outputRate);
        return id === null ? null : new WorkerConverter(id);
    }

    convert(pcm: Int16Array, emit: (converted: Int16Array) => void): void {
        thread.send(this.id, pcm, emit);
    }

    reset(): void {
        thread.reset(this.id);
    }

    close(): void {
        thread.close(this.id);
    }
}
