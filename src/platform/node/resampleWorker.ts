import { SincResampler } from "@/domain/audio/SincResampler";
import { parentPort } from "node:worker_threads";

/**
 * O outro lado do `WorkerConverter`: um thread que só reamostra.
 *
 * Guarda um reamostrador por fluxo, porque o estado é o que emenda um frame no seguinte —
 * um reamostrador só, compartilhado, misturaria o áudio de duas chamadas.
 */
type Incoming =
    | { readonly type: "open"; readonly id: number; readonly inputRate: number; readonly outputRate: number }
    | { readonly type: "convert"; readonly id: number; readonly pcm: ArrayBuffer }
    | { readonly type: "reset"; readonly id: number }
    | { readonly type: "close"; readonly id: number };

const resamplers = new Map<number, SincResampler>();

parentPort?.on("message", (message: Incoming) => {
    if (message.type === "open") {
        resamplers.set(message.id, new SincResampler(message.inputRate, message.outputRate));
        return;
    }
    if (message.type === "reset") {
        resamplers.get(message.id)?.reset();
        return;
    }
    if (message.type === "close") {
        resamplers.delete(message.id);
        return;
    }
    convert(message.id, message.pcm);
});

function convert(id: number, pcm: ArrayBuffer): void {
    const resampler = resamplers.get(id);
    if (!resampler) return;

    const converted = resampler.process(new Int16Array(pcm));
    if (converted.length === 0) return;

    // O buffer é transferido, e não copiado: sai daqui e chega lá sem passar por serialização.
    const out = converted.buffer.byteLength === converted.byteLength ? converted : new Int16Array(converted);
    parentPort?.postMessage({ id, pcm: out.buffer }, [out.buffer as ArrayBuffer]);
}
