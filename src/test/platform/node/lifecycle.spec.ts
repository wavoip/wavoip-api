// @vitest-environment node
import { nodeRuntime } from "@/platform/node/nodeRuntime";
import { RecordingSink } from "@/test/fakes/RecordingSink";
import { ToneSource } from "@/test/fakes/ToneSource";
import { describe, expect, it, vi } from "vitest";

/**
 * Regressão: o diagnóstico abre e fecha o microfone antes da primeira chamada, e o
 * conversor morria junto. Com o worker ligado o áudio saía em **silêncio absoluto** dali em
 * diante, e nada no log dizia por quê — a chamada conectava e o outro lado não ouvia nada.
 *
 * O conversor agora nasce em cada `start` e morre no `stop` correspondente.
 */
describe("reopening the microphone after it was closed", () => {
    for (const resampleInWorker of [false, true]) {
        it(`keeps the audio flowing, with the worker ${resampleInWorker ? "on" : "off"}`, async () => {
            // 44,1 kHz: sem conversão o defeito não aparece, porque nada passa pelo conversor.
            const runtime = nodeRuntime({
                source: new ToneSource(44_100),
                sink: new RecordingSink(),
                resampleInWorker,
            });

            const first = await levelAfterOpening(runtime);
            await runtime.microphone.close();

            const second = await levelAfterOpening(runtime);

            expect(first).toBeGreaterThan(0.01);
            expect(second).toBeGreaterThan(first / 2);
        }, 20_000);
    }
});

async function levelAfterOpening(runtime: ReturnType<typeof nodeRuntime>): Promise<number> {
    const meter = runtime.engine.monitorStream(await runtime.microphone.open());
    await vi.waitFor(() => expect(meter.level()).toBeGreaterThan(0.01), { timeout: 8_000, interval: 100 });

    const level = meter.level() ?? 0;
    meter.stop();
    return level;
}
