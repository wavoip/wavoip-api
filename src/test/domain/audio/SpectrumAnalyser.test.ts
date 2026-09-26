import { SpectrumAnalyser } from "@/domain/audio/SpectrumAnalyser";
import { describe, expect, it } from "vitest";

const RATE = 16_000;
const SIZE = 512;

describe("SpectrumAnalyser", () => {
    it("says nothing until it has a full block", () => {
        const analyser = new SpectrumAnalyser(SIZE);
        analyser.push(tone(1_000, 100));

        expect(analyser.bands()).toHaveLength(0);
    });

    it("refuses a size the FFT cannot use", () => {
        expect(() => new SpectrumAnalyser(500)).toThrow(/potência de dois, e veio 500/);
    });

    /** O teste que prova que é espectro de verdade: o pico cai na banda da frequência tocada. */
    it("puts the peak on the band of the tone it heard", () => {
        for (const hz of [500, 1_000, 2_000, 4_000]) {
            const analyser = new SpectrumAnalyser(SIZE);
            analyser.push(tone(hz, SIZE));

            const bands = analyser.bands();
            const expected = Math.round((hz / RATE) * SIZE);

            expect(Math.abs(peakIndexOf(bands) - expected)).toBeLessThanOrEqual(2);
        }
    });

    it("reads silence as all zeros", () => {
        const analyser = new SpectrumAnalyser(SIZE);
        analyser.push(new Int16Array(SIZE));

        expect(Array.from(analyser.bands()).every((band) => band === 0)).toBe(true);
    });

    it("keeps the newest audio when more arrives than it holds", () => {
        const analyser = new SpectrumAnalyser(SIZE);
        analyser.push(tone(500, SIZE));
        analyser.push(tone(4_000, SIZE * 3));

        // O tom antigo saiu: o pico é o do último a entrar.
        expect(Math.abs(peakIndexOf(analyser.bands()) - Math.round((4_000 / RATE) * SIZE))).toBeLessThanOrEqual(2);
    });

    /**
     * O relay entrega frames de 160 amostras, e o bloco da FFT tem 512: o espectro só existe
     * depois de alguns frames, e a emenda entre eles não pode inventar frequência nenhuma.
     */
    it("fills up across several small frames, as the relay delivers them", () => {
        const analyser = new SpectrumAnalyser(SIZE);

        analyser.push(tone(1_000, 160, 0));
        analyser.push(tone(1_000, 160, 160));
        expect(analyser.bands()).toHaveLength(0);

        analyser.push(tone(1_000, 160, 320));
        analyser.push(tone(1_000, 160, 480));

        const bands = analyser.bands();
        expect(bands).toHaveLength(SIZE / 2);
        expect(Math.abs(peakIndexOf(bands) - Math.round((1_000 / RATE) * SIZE))).toBeLessThanOrEqual(2);
    });

    it("gives one band per two samples, like the browser does", () => {
        const analyser = new SpectrumAnalyser(SIZE);
        analyser.push(tone(1_000, SIZE));

        expect(analyser.bands()).toHaveLength(SIZE / 2);
    });
});

function tone(hz: number, samples: number, startAt = 0): Int16Array {
    return Int16Array.from({ length: samples }, (_, i) =>
        Math.round(10_000 * Math.sin((2 * Math.PI * hz * (startAt + i)) / RATE)),
    );
}

function peakIndexOf(bands: Uint8Array): number {
    let peak = 0;
    for (let i = 1; i < bands.length; i += 1) if (bands[i] > bands[peak]) peak = i;
    return peak;
}
