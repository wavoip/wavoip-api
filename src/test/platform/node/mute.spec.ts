// @vitest-environment node
import { nodeRuntime } from "@/platform/node/nodeRuntime";
import { RecordingSink } from "@/test/fakes/RecordingSink";
import { ToneSource } from "@/test/fakes/ToneSource";
import { describe, expect, it, vi } from "vitest";

/**
 * Regressão: o `capturePcm` do relay não passa por track nenhuma, então o mute que só
 * desabilitava a track deixava o áudio do integrador seguir para o outro lado. Quem pediu
 * silêncio continuava sendo ouvido.
 */
describe("muting a Node call", () => {
    it("silences the relay path, which does not go through a track", async () => {
        const runtime = nodeRuntime({ source: new ToneSource(), sink: new RecordingSink() });
        const captured: number[] = [];

        await runtime.microphone.open();
        const handle = runtime.engine.capturePcm(null as never, (pcm) => {
            for (const sample of new Int16Array(pcm)) captured.push(sample);
        });

        await vi.waitFor(() => expect(peakOf(captured)).toBeGreaterThan(0));

        runtime.microphone.setMuted(true);
        captured.length = 0;
        await vi.waitFor(() => expect(captured.length).toBeGreaterThan(160));
        expect(peakOf(captured)).toBe(0);

        runtime.microphone.setMuted(false);
        captured.length = 0;
        await vi.waitFor(() => expect(peakOf(captured)).toBeGreaterThan(0));

        handle.stop();
        await runtime.microphone.close();
    });
});

function peakOf(samples: number[]): number {
    return samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
}
