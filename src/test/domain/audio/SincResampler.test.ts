import { SincResampler } from "@/domain/audio/SincResampler";
import { describe, expect, it } from "vitest";

const AMPLITUDE = 10_000;

describe("SincResampler", () => {
    it("hands the PCM through untouched when the rates match", () => {
        const resampler = new SincResampler(16_000, 16_000);
        const input = tone(1_000, 16_000, 160);

        expect(resampler.isIdentity).toBe(true);
        expect(resampler.process(input)).toBe(input);
    });

    it("rejects a rate that cannot exist", () => {
        expect(() => new SincResampler(0, 16_000)).toThrow(/positivas, e vieram 0 → 16000/);
    });

    it("produces roughly one output sample per ratio step", () => {
        const resampler = new SincResampler(48_000, 16_000);
        const output = resampler.process(tone(1_000, 48_000, 4_800));

        // 4800 entradas a 48k viram ~1600 a 16k; a folga é o contexto guardado para a emenda.
        expect(output.length).toBeGreaterThan(1_550);
        expect(output.length).toBeLessThanOrEqual(1_600);
    });

    it("keeps a voice-band tone when downsampling", () => {
        const resampler = new SincResampler(48_000, 16_000);
        const output = resampler.process(tone(1_000, 48_000, 9_600));

        // Um tom de 1 kHz está muito abaixo do Nyquist de 8 kHz: tem de sair inteiro.
        expect(rms(output)).toBeGreaterThan(AMPLITUDE * 0.6);
    });

    /**
     * O teste que justifica o sinc. Um tom de 15 kHz não cabe a 16 kHz — o Nyquist é 8 kHz.
     * Sem filtro anti-aliasing ele não some: dobra para 1 kHz com energia cheia, e voz vira
     * ruído metálico. Com o kernel escalado pela razão, ele é atenuado.
     */
    it("rejects what cannot exist at the new rate, instead of folding it into the band", () => {
        const resampler = new SincResampler(48_000, 16_000);
        const output = resampler.process(tone(15_000, 48_000, 9_600));

        expect(rms(output)).toBeLessThan(AMPLITUDE * 0.1);
    });

    it("upsamples without inventing energy", () => {
        const resampler = new SincResampler(16_000, 48_000);
        const output = resampler.process(tone(1_000, 16_000, 1_600));

        expect(output.length).toBeGreaterThan(4_600);
        expect(rms(output)).toBeGreaterThan(AMPLITUDE * 0.6);
        expect(peak(output)).toBeLessThanOrEqual(AMPLITUDE * 1.2);
    });

    it("joins frames without a seam", () => {
        const whole = new SincResampler(48_000, 16_000).process(tone(1_000, 48_000, 4_800));

        const piecewise = new SincResampler(48_000, 16_000);
        const chunks: Int16Array[] = [];
        for (let offset = 0; offset < 4_800; offset += 480) {
            chunks.push(piecewise.process(tone(1_000, 48_000, 480, offset)));
        }
        const joined = concat(chunks);

        // Frame a frame ou de uma vez, o resultado é o mesmo sinal: a emenda não estala.
        expect(joined.length).toBeGreaterThan(whole.length - 40);
        expect(Math.abs(rms(joined) - rms(whole))).toBeLessThan(AMPLITUDE * 0.05);
    });

    it("forgets its context on reset", () => {
        const resampler = new SincResampler(48_000, 16_000);
        resampler.process(tone(1_000, 48_000, 4_800));
        resampler.reset();

        const afterReset = resampler.process(tone(1_000, 48_000, 4_800));
        expect(rms(afterReset)).toBeGreaterThan(AMPLITUDE * 0.6);
    });
});

function tone(hz: number, sampleRate: number, samples: number, startAt = 0): Int16Array {
    const pcm = new Int16Array(samples);
    for (let i = 0; i < samples; i += 1) {
        pcm[i] = Math.round(AMPLITUDE * Math.sin((2 * Math.PI * hz * (startAt + i)) / sampleRate));
    }
    return pcm;
}

function rms(pcm: Int16Array): number {
    if (pcm.length === 0) return 0;
    const sum = pcm.reduce((total, s) => total + s * s, 0);
    return Math.sqrt(sum / pcm.length);
}

function peak(pcm: Int16Array): number {
    return pcm.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
}

function concat(chunks: Int16Array[]): Int16Array {
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const joined = new Int16Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        joined.set(chunk, offset);
        offset += chunk.length;
    }
    return joined;
}
