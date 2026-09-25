import { FRAME_SAMPLES } from "@/platform/node/audioIo";
import { PcmFrameQueue } from "@/platform/node/PcmFrameQueue";
import { describe, expect, it } from "vitest";

const FRAME_BYTES = FRAME_SAMPLES * 2;

describe("PcmFrameQueue", () => {
    it("cuts frames of exactly one tick", () => {
        const queue = new PcmFrameQueue();
        queue.push(new Int16Array(FRAME_SAMPLES * 2));

        expect(queue.take().length).toBe(FRAME_SAMPLES);
        expect(queue.take().length).toBe(FRAME_SAMPLES);
    });

    /**
     * Regressão: com `subarray` o frame media 320 bytes mas carregava o buffer inteiro da
     * fila atrás dele, e o `RTCAudioSource` do wrtc — que valida o buffer, não a janela —
     * recusava com `Expected a .byteLength of 320`. Só aparecia quando sobrava resto, ou
     * seja, só quando havia reamostragem no caminho.
     */
    it("hands out a frame that owns its buffer, resto na fila ou não", () => {
        const queue = new PcmFrameQueue();
        queue.push(new Int16Array(FRAME_SAMPLES + 47)); // sobra resto de propósito

        const frame = queue.take();

        expect(frame.byteLength).toBe(FRAME_BYTES);
        expect(frame.buffer.byteLength).toBe(FRAME_BYTES);
    });

    it("answers silence that also owns its buffer", () => {
        const silence = new PcmFrameQueue().take();

        expect(silence.buffer.byteLength).toBe(FRAME_BYTES);
        expect(silence.every((sample) => sample === 0)).toBe(true);
    });

    it("reports how much audio is waiting, in milliseconds", () => {
        const queue = new PcmFrameQueue();
        queue.push(new Int16Array(FRAME_SAMPLES * 3));

        expect(queue.bufferedMs).toBe(30);
        queue.take();
        expect(queue.bufferedMs).toBe(20);
    });
});
