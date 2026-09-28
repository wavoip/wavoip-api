import { ClipDetector } from "@/domain/audio/ClipDetector";
import { describe, expect, it } from "vitest";

describe("ClipDetector", () => {
    it("reads zero before hearing anything", () => {
        expect(new ClipDetector().fraction).toBe(0);
    });

    it("ignores a signal that fits with room to spare", () => {
        const detector = new ClipDetector();
        detector.push(tone(0.5, 1_600));

        expect(detector.fraction).toBe(0);
    });

    it("counts the samples pinned at the ceiling", () => {
        const detector = new ClipDetector();
        // Metade estourada, metade limpa.
        detector.push(Int16Array.from({ length: 1_000 }, (_, i) => (i % 2 === 0 ? 32_767 : 1_000)));

        expect(detector.fraction).toBeCloseTo(0.5, 1);
    });

    it("counts the negative ceiling too", () => {
        const detector = new ClipDetector();
        detector.push(Int16Array.from({ length: 100 }, () => -32_768));

        expect(detector.fraction).toBe(1);
    });

    /** Um estouro que passou não pode manter o aviso aceso depois que a pessoa corrigiu. */
    it("forgets an old burst once clean audio takes over", () => {
        const detector = new ClipDetector();
        detector.push(Int16Array.from({ length: 1_600 }, () => 32_767));
        expect(detector.fraction).toBe(1);

        for (let i = 0; i < 20; i += 1) detector.push(tone(0.5, 1_600));

        expect(detector.fraction).toBeLessThan(0.05);
    });

    it("reads the browser's normalized samples on the same scale", () => {
        const detector = new ClipDetector();
        detector.pushNormalized(Float32Array.from({ length: 100 }, () => 1));

        expect(detector.fraction).toBe(1);
    });

    it("does not call a loud but clean signal clipped", () => {
        const detector = new ClipDetector();
        detector.pushNormalized(Float32Array.from({ length: 1_000 }, (_, i) => 0.9 * Math.sin(i / 4)));

        expect(detector.fraction).toBe(0);
    });

    it("starts over on reset", () => {
        const detector = new ClipDetector();
        detector.push(Int16Array.from({ length: 100 }, () => 32_767));
        detector.reset();

        expect(detector.fraction).toBe(0);
    });
});

function tone(amplitude: number, samples: number): Int16Array {
    return Int16Array.from({ length: samples }, (_, i) => Math.round(amplitude * 32_767 * Math.sin(i / 8)));
}
