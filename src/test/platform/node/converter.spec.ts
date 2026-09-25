// @vitest-environment node
import { LocalConverter } from "@/platform/node/PcmConverter";
import { nodeRuntime } from "@/platform/node/nodeRuntime";
import { describe, expect, it } from "vitest";

describe("LocalConverter", () => {
    it("converts on the spot and hands the result to the callback", () => {
        const converter = new LocalConverter(48_000, 16_000);
        const received: Int16Array[] = [];

        converter.convert(tone(4_800), (out) => received.push(out));

        expect(received).toHaveLength(1);
        expect(received[0].length).toBeGreaterThan(1_500);
    });

    it("says nothing when there is not enough audio to produce a sample yet", () => {
        const converter = new LocalConverter(48_000, 16_000);
        const received: Int16Array[] = [];

        converter.convert(new Int16Array(4), (out) => received.push(out));

        expect(received).toHaveLength(0);
    });
});

/**
 * A regra que evita o pior dos dois mundos: com as taxas iguais não há o que reamostrar, e
 * mandar o PCM a outro thread para ele voltar intacto só somaria uma viagem. Por isso o
 * worker é ignorado nesse caso, mesmo quando ligado.
 */
describe("nodeRuntime with the worker asked for", () => {
    it("stays on the main thread when there is nothing to resample", () => {
        const written: number[] = [];
        const runtime = nodeRuntime({
            source: { start() {}, stop() {} },
            sink: { write: (pcm) => written.push(pcm.length), end() {} },
            resampleInWorker: true,
        });

        runtime.engine.playPcm().write(new Int16Array(160).buffer);

        // Síncrono: se tivesse ido para o worker, só chegaria em algum tick adiante.
        expect(written).toEqual([160]);
    });

    it("leaves the main thread when there is", async () => {
        const written: number[] = [];
        const runtime = nodeRuntime({
            source: { start() {}, stop() {} },
            sink: { sampleRate: 48_000, write: (pcm) => written.push(pcm.length), end() {} },
            resampleInWorker: true,
        });

        runtime.engine.playPcm().write(new Int16Array(160).buffer);
        expect(written).toEqual([]);
    });
});

function tone(samples: number): Int16Array {
    return Int16Array.from({ length: samples }, (_, i) =>
        Math.round(8_000 * Math.sin((2 * Math.PI * 440 * i) / 48_000)),
    );
}
