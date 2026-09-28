import { AdaptiveResampler } from "@/domain/audio/AdaptiveResampler";
import { describe, expect, it } from "vitest";

describe("AdaptiveResampler", () => {
    it("converts from whatever rate the block declares", () => {
        const resampler = new AdaptiveResampler(16_000);

        // Um segundo a 48 kHz precisa sair como um segundo a 16 kHz.
        const out = resampler.process(tone(48_000), 48_000);

        expect(out.length).toBeGreaterThan(15_500);
        expect(out.length).toBeLessThanOrEqual(16_000);
    });

    it("passes the audio through when the rate already matches", () => {
        const input = tone(1_600);
        expect(new AdaptiveResampler(16_000).process(input, 16_000)).toBe(input);
    });

    /** A fonte pode trocar de taxa no meio: o decodificador e o hardware fazem isso. */
    it("follows a rate that changes between blocks", () => {
        const resampler = new AdaptiveResampler(16_000);

        const at48 = resampler.process(tone(4_800), 48_000).length;
        const at16 = resampler.process(tone(1_600), 16_000).length;

        expect(at48).toBeGreaterThan(1_500);
        expect(at48).toBeLessThanOrEqual(1_600);
        expect(at16).toBe(1_600);
    });
});

function tone(samples: number): Int16Array {
    return Int16Array.from({ length: samples }, (_, i) => Math.round(9_000 * Math.sin(i / 7)));
}
