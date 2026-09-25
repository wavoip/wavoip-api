// @vitest-environment node
import { type AudioSink, type AudioSource, SAMPLE_RATE } from "@/platform/node/audioIo";
import { nodeRuntime } from "@/platform/node/nodeRuntime";
import { describe, expect, it, vi } from "vitest";

/**
 * O que um integrador realmente tem na mão: Float32 vindo de um decodificador, 44,1 kHz de
 * um MP3, estéreo de um arquivo de música. Nada disso pode virar trabalho dele.
 */
describe("the formats an integrator actually has", () => {
    it("takes Float32 at 44.1kHz in stereo and still feeds the call", async () => {
        const source = new DecoderSource({ sampleRate: 44_100, channelCount: 2 });
        const sink = new CountingSink(48_000);
        const runtime = nodeRuntime({ source, sink });

        const captured: number[] = [];
        await runtime.microphone.open();
        const handle = runtime.engine.capturePcm(null as never, (pcm) => {
            for (const sample of new Int16Array(pcm)) captured.push(sample);
        });

        await vi.waitFor(() => expect(captured.length).toBeGreaterThan(SAMPLE_RATE / 20));

        // Chegou som de verdade, e não silêncio nem estouro.
        expect(peakOf(captured)).toBeGreaterThan(3_000);
        expect(peakOf(captured)).toBeLessThanOrEqual(32_767);

        handle.stop();
        await runtime.microphone.close();
    });

    it("writes back at the rate the sink asked for", async () => {
        const sink = new CountingSink(48_000);
        const runtime = nodeRuntime({ source: new DecoderSource({}), sink });

        const playback = runtime.engine.playPcm();
        // Um segundo de áudio a 16 kHz tem de sair como três segundos de amostras a 48 kHz.
        for (let i = 0; i < 100; i += 1) playback.write(toneFrame(160).buffer as ArrayBuffer);

        expect(sink.written).toBeGreaterThan(16_000 * 2.8);
        expect(sink.written).toBeLessThan(16_000 * 3.1);
    });

    it("leaves the PCM alone when the format already matches", async () => {
        const sink = new CountingSink(SAMPLE_RATE);
        const runtime = nodeRuntime({ source: new DecoderSource({}), sink });

        const playback = runtime.engine.playPcm();
        playback.write(toneFrame(160).buffer as ArrayBuffer);

        expect(sink.written).toBe(160);
    });
});

/** Um decodificador qualquer: entrega Float32, como quase todos entregam. */
class DecoderSource implements AudioSource {
    readonly sampleRate?: number;
    readonly channelCount?: number;
    private ticker: ReturnType<typeof setInterval> | null = null;
    private phase = 0;

    constructor({ sampleRate, channelCount }: { sampleRate?: number; channelCount?: number }) {
        this.sampleRate = sampleRate;
        this.channelCount = channelCount;
    }

    start(onFrame: (pcm: Float32Array) => void): void {
        const rate = this.sampleRate ?? SAMPLE_RATE;
        const channels = this.channelCount ?? 1;
        const frames = Math.round(rate / 100);

        this.ticker = setInterval(() => {
            const frame = new Float32Array(frames * channels);
            for (let i = 0; i < frames; i += 1) {
                const value = 0.5 * Math.sin((2 * Math.PI * 440 * this.phase) / rate);
                for (let c = 0; c < channels; c += 1) frame[i * channels + c] = value;
                this.phase += 1;
            }
            onFrame(frame);
        }, 10);
    }

    stop(): void {
        if (this.ticker) clearInterval(this.ticker);
        this.ticker = null;
    }
}

class CountingSink implements AudioSink {
    written = 0;
    constructor(readonly sampleRate: number) {}
    write(pcm: Int16Array): void {
        this.written += pcm.length;
    }
    end(): void {}
}

function toneFrame(samples: number): Int16Array {
    return Int16Array.from({ length: samples }, (_, i) =>
        Math.round(8_000 * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE)),
    );
}

function peakOf(samples: number[]): number {
    return samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
}
