// @vitest-environment node
import { SAMPLE_RATE } from "@/platform/node/audioIo";
import { nodeRuntime } from "@/platform/node/nodeRuntime";
import { RecordingSink } from "@/test/fakes/RecordingSink";
import { ToneSource } from "@/test/fakes/ToneSource";
import { describe, expect, it, vi } from "vitest";

/**
 * Gravar uma chamada quer dizer gravar os dois lados: o `sink` traz só o que o contato falou,
 * e sem o outro a gravação é meia conversa.
 */
describe("the outgoing sink", () => {
    it("receives a copy of what the call is sending", async () => {
        const outgoing = new RecordingSink();
        const runtime = nodeRuntime({ source: new ToneSource(), sink: new RecordingSink(), outgoingSink: outgoing });

        await runtime.microphone.open();
        await vi.waitFor(() => expect(outgoing.samples.length).toBeGreaterThan(SAMPLE_RATE / 10));

        expect(outgoing.peak).toBeGreaterThan(1_000);
        await runtime.microphone.close();
    }, 15_000);

    /** O que se grava é o que o outro lado ouve — e com o mudo ligado ele não ouve nada. */
    it("records the silence the far end hears while muted", async () => {
        const outgoing = new RecordingSink();
        const runtime = nodeRuntime({ source: new ToneSource(), sink: new RecordingSink(), outgoingSink: outgoing });

        await runtime.microphone.open();
        await vi.waitFor(() => expect(outgoing.peak).toBeGreaterThan(1_000));

        runtime.microphone.setMuted(true);
        outgoing.samples.length = 0;
        await vi.waitFor(() => expect(outgoing.samples.length).toBeGreaterThan(1_000));

        expect(outgoing.peak).toBe(0);
        await runtime.microphone.close();
    }, 15_000);

    /**
     * Copiar não é consumir: um gravador não pode fazer o microfone abrir sozinho, nem
     * mantê-lo aberto depois que a chamada terminou.
     */
    it("does not make the microphone open on its own", async () => {
        const outgoing = new RecordingSink();
        nodeRuntime({ source: new ToneSource(), sink: new RecordingSink(), outgoingSink: outgoing });

        await new Promise((resolve) => setTimeout(resolve, 300));

        expect(outgoing.samples).toHaveLength(0);
    });

    it("converts to the rate this sink asked for", async () => {
        const outgoing = new RecordingSink(48_000);
        const runtime = nodeRuntime({ source: new ToneSource(), sink: new RecordingSink(), outgoingSink: outgoing });

        await runtime.microphone.open();
        await vi.waitFor(() => expect(outgoing.samples.length).toBeGreaterThan(SAMPLE_RATE));

        // Um segundo de chamada a 16 kHz vira três segundos de amostras a 48 kHz.
        const seconds = outgoing.samples.length / 48_000;
        expect(seconds).toBeLessThan(2);
        await runtime.microphone.close();
    }, 15_000);
});
