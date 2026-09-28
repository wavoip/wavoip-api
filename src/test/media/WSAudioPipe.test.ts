import { WSAudioPipe } from "@/modules/media/relay/AudioPipe";
import { FakeAudioRuntime } from "@/test/fakes/FakeAudioRuntime";
import { beforeEach, describe, expect, it } from "vitest";

const CALL_RATE = 16_000;
const BLOCK = 512;

/**
 * O caminho do relay não tinha cobertura nenhuma, e é o único onde o áudio das duas direções
 * passa em claro por este processo. É daí que saem nível e espectro — e é por isso que a
 * chamada não oficial tem espectro em toda plataforma, incluindo o React Native.
 */
describe("WSAudioPipe", () => {
    let runtime: FakeAudioRuntime;
    let sent: ArrayBuffer[];
    let pipe: WSAudioPipe;

    beforeEach(() => {
        runtime = new FakeAudioRuntime();
        sent = [];
        pipe = new WSAudioPipe(runtime, (pcm) => sent.push(pcm));
    });

    it("reads zero on both directions before the media is up", () => {
        expect(pipe.audio.out.level()).toBe(0);
        expect(pipe.audio.in.level()).toBe(0);
        expect(pipe.audio.out.spectrum()).toHaveLength(0);
        expect(pipe.audio.in.spectrum()).toHaveLength(0);
    });

    it("sends the microphone's PCM on, and measures it on the way", async () => {
        await pipe.start();

        runtime.engine.pushCaptured(tone(1_000, BLOCK));

        expect(sent).toHaveLength(1);
        expect(pipe.audio.out.level()).toBeGreaterThan(0.1);
        expect(peakBandOf(pipe.audio.out.spectrum())).toBe(bandOf(1_000));
    });

    it("measures what arrives from the relay, and plays it", async () => {
        await pipe.start();

        pipe.playInbound(tone(2_000, BLOCK).buffer as ArrayBuffer);

        expect(pipe.audio.in.level()).toBeGreaterThan(0.1);
        expect(peakBandOf(pipe.audio.in.spectrum())).toBe(bandOf(2_000));
    });

    /** Cada direção tem o próprio analisador: o que entra não pode vazar para o que sai. */
    it("keeps the two directions apart", async () => {
        await pipe.start();

        runtime.engine.pushCaptured(tone(1_000, BLOCK));
        pipe.playInbound(tone(4_000, BLOCK).buffer as ArrayBuffer);

        expect(peakBandOf(pipe.audio.out.spectrum())).toBe(bandOf(1_000));
        expect(peakBandOf(pipe.audio.in.spectrum())).toBe(bandOf(4_000));
    });

    /**
     * Quem abre o microfone é o motor, e é ele quem fecha pelo handle: no React Native o
     * `getUserMedia` do WebRTC não serve para capturar PCM, e abri-lo aqui seria um segundo
     * acesso nativo ao mesmo microfone. O pipe só manda parar.
     */
    it("asks the engine for the audio, instead of opening the microphone itself", async () => {
        await pipe.start();

        expect(runtime.engine.capturedFrom).toBe(runtime.microphone);
    });

    it("stops the capture when the media goes down", async () => {
        await pipe.start();
        await pipe.stop();

        expect(runtime.engine.captured[0].stopped).toBe(true);
        expect(pipe.audio.out.level()).toBe(0);
    });

    it("drops what arrives after the media went down", async () => {
        await pipe.start();
        await pipe.stop();

        pipe.playInbound(tone(1_000, BLOCK).buffer as ArrayBuffer);

        expect(pipe.audio.in.level()).toBe(0);
    });
});

function tone(hz: number, samples: number): Int16Array {
    return Int16Array.from({ length: samples }, (_, i) =>
        Math.round(9_000 * Math.sin((2 * Math.PI * hz * i) / CALL_RATE)),
    );
}

function bandOf(hz: number): number {
    return Math.round((hz / CALL_RATE) * BLOCK);
}

function peakBandOf(bands: Uint8Array): number {
    let peak = 0;
    for (let i = 1; i < bands.length; i += 1) if (bands[i] > bands[peak]) peak = i;
    return peak;
}
