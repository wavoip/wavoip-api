import { WebsocketTransport } from "@/modules/media/relay/Transport";
import { FakeAudioRuntime } from "@/test/fakes/FakeAudioRuntime";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Atender não espera o relay conectar: a mídia sobe em paralelo para a chamada existir logo.
 * O preço disso é que a falha não tem para quem voltar — o `accept` já respondeu. Sem o
 * evento, o microfone recusado virava uma chamada de pé e muda, para sempre.
 */
describe("WebsocketTransport — falha ao subir depois do aceite", () => {
    let runtime: FakeAudioRuntime;
    let transport: WebsocketTransport;

    beforeEach(() => {
        runtime = new FakeAudioRuntime();
        transport = new WebsocketTransport(runtime, "device-token");
    });

    it("announces the failure that nobody is awaiting", async () => {
        const failures: { code: string; cause?: unknown }[] = [];
        transport.on("failed", (error) => failures.push(error));
        runtime.engine.captureFailure = new Error("o aparelho gravou em 44100 Hz, e a chamada fala 16000 Hz mono");

        await transport.accept();
        await settle();

        expect(failures).toHaveLength(1);
        expect(failures[0].code).toBe("LOCAL_AUDIO_FAILED");
        expect((failures[0].cause as Error).message).toContain("44100");
    });

    /** A outra metade: o servidor que atende sem dizer onde o relay espera. */
    it("separates the server's half from the microphone's", async () => {
        const failures: { code: string }[] = [];
        transport.on("failed", (error) => failures.push(error));

        await transport.accept();
        await settle();

        expect(failures).toHaveLength(1);
        expect(failures[0].code).toBe("SERVER_ERROR");
    });

    it("stays quiet when the media comes up", async () => {
        const failures: unknown[] = [];
        transport.on("failed", (error) => failures.push(error));
        transport.useRelay({ host: "relay.test", port: "443" });

        await transport.accept();
        await settle();

        expect(failures).toEqual([]);
    });
});

/** A subida acontece fora do `await` do aceite; isto dá a vez a ela. */
function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}
