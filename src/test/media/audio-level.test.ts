import { rmsInt16 } from "@/modules/media/audio-level";
import { describe, expect, it } from "vitest";

function buildInt16Buffer(samples: number[]): ArrayBuffer {
    const arr = new Int16Array(samples);
    return arr.buffer;
}

describe("rmsInt16", () => {
    it("returns 0 for an empty buffer", () => {
        expect(rmsInt16(new ArrayBuffer(0))).toBe(0);
    });

    it("returns 0 for an all-zero PCM frame (silence)", () => {
        expect(rmsInt16(buildInt16Buffer([0, 0, 0, 0]))).toBe(0);
    });

    it("returns 1 for full-scale ±32768 samples (clipping)", () => {
        const fullScale = buildInt16Buffer([32767, -32768, 32767, -32768]);
        expect(rmsInt16(fullScale)).toBeCloseTo(1, 3);
    });

    it("matches the closed-form RMS for a known waveform", () => {
        // 16384 = meia escala → 0.5; o RMS de uma constante 0.5 é 0.5
        expect(rmsInt16(buildInt16Buffer([16384, 16384, 16384, 16384]))).toBeCloseTo(0.5, 3);
    });

    it("reads Int16 from any ArrayBuffer (160-byte PCMU frame shape)", () => {
        const arr = new Int16Array(80).fill(16384); // 160 bytes / 2 bytes por amostra
        expect(rmsInt16(arr.buffer)).toBeCloseTo(0.5, 3);
    });
});
