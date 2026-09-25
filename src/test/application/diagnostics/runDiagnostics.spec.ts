import { runDiagnostics } from "@/application/diagnostics/runDiagnostics";
import type { DiagnosticCode } from "@/domain/diagnostics/types";
import type { WavoipRuntime } from "@/ports/WavoipRuntime";
import { type FakeAudioEngine, FakeAudioRuntime, type FakeMicrophone } from "@/test/fakes/FakeAudioRuntime";
import { describe, expect, it, vi } from "vitest";

/** Um runtime completo de mentira, para cada teste tirar dele só o que quer provar. */
/**
 * Roda o diagnóstico com o microfone entregando o áudio pedido. A captura começa dentro da
 * verificação, então os frames são empurrados assim que ela aparece.
 */
async function withMicrophoneAudio(runtime: ReturnType<typeof runtimeWith>, pcm: Int16Array) {
    const pending = runDiagnostics({ runtime, stunServers: [] });
    await vi.waitFor(() => expect(runtime.engine.captured.length).toBeGreaterThan(0));
    runtime.engine.pushCaptured(pcm);
    return pending;
}

/** Uma voz forte, mas que não bate no teto. */
function cleanAudio(samples: number): Int16Array {
    return Int16Array.from({ length: samples }, (_, i) => Math.round(20_000 * Math.sin(i / 8)));
}

/** Um microfone com ganho demais: a maior parte das amostras ceifada. */
function clippedAudio(samples: number): Int16Array {
    return Int16Array.from({ length: samples }, (_, i) => (i % 8 < 6 ? 32_767 : 5_000));
}

function runtimeWith(overrides: Partial<WavoipRuntime> = {}): WavoipRuntime & {
    engine: FakeAudioEngine;
    microphone: FakeMicrophone;
} {
    const fake = new FakeAudioRuntime();
    return {
        engine: fake.engine,
        microphone: fake.microphone,
        audio: {
            listInputDevices: () => [{ id: "mic", label: "Microfone", kind: "input" as const }],
            listOutputDevices: () => [{ id: "speaker", label: "Alto-falante", kind: "output" as const }],
            currentInput: null,
            currentOutput: null,
            selectInput: async () => ({ data: null, error: { code: "INPUT_SELECTION_UNSUPPORTED" as const } }),
            selectOutput: async () => ({ data: null, error: { code: "OUTPUT_SELECTION_UNSUPPORTED" as const } }),
        },
        usesAudioDevices: true,
        createPeer: fake.createPeer,
        openSocket: fake.openSocket,
        ...overrides,
    } as WavoipRuntime & { engine: FakeAudioEngine; microphone: FakeMicrophone };
}

const codesOf = (checks: readonly { code: DiagnosticCode }[]) => checks.map((check) => check.code);

describe("runDiagnostics", () => {
    it("says the platform cannot make an official call when it has no WebRTC", async () => {
        const report = await runDiagnostics({ runtime: runtimeWith({ createPeer: undefined }), stunServers: [] });

        expect(codesOf(report.checks)).toContain("WEBRTC_MISSING");
        expect(report.readiness.OFFICIAL).toEqual({ ready: false, blockedBy: ["WEBRTC_MISSING"] });
        // O outro tipo continua de pé: a falta é de um transporte, não do áudio.
        expect(report.readiness.UNOFFICIAL.ready).toBe(true);
    });

    it("says the same about the unofficial call and its socket", async () => {
        const report = await runDiagnostics({ runtime: runtimeWith({ openSocket: undefined }), stunServers: [] });

        expect(report.readiness.UNOFFICIAL.blockedBy).toEqual(["BINARY_SOCKET_MISSING"]);
        expect(report.readiness.OFFICIAL.ready).toBe(true);
    });

    /**
     * O caso que o diagnóstico existe para distinguir: o navegador segurando o áudio até um
     * gesto não é defeito, mas a chamada sai muda se ninguém avisar a pessoa.
     */
    it("blames the missing gesture, and not the audio, when the platform is holding the sound", async () => {
        const runtime = runtimeWith();
        runtime.engine.state = "suspended";

        const report = await runDiagnostics({ runtime, stunServers: [] });

        expect(codesOf(report.checks)).toContain("USER_GESTURE_REQUIRED");
        expect(codesOf(report.checks)).not.toContain("AUDIO_ENGINE_FAILED");
        expect(report.readiness.OFFICIAL.ready).toBe(true);
    });

    it("reports a broken audio engine with what the platform said", async () => {
        const runtime = runtimeWith();
        runtime.engine.prepare = async () => {
            throw new Error("AudioWorklet blocked by CSP");
        };

        const report = await runDiagnostics({ runtime, stunServers: [] });
        const failure = report.checks.find((check) => check.code === "AUDIO_ENGINE_FAILED");

        expect(failure?.details?.cause).toContain("CSP");
        expect(report.readiness.OFFICIAL.ready).toBe(false);
    });

    it("counts the microphones it found, with their names", async () => {
        const report = await runDiagnostics({ runtime: runtimeWith(), stunServers: [] });
        const found = report.checks.find((check) => check.code === "MICROPHONE_FOUND");

        expect(found?.details).toEqual({ count: 1, names: ["Microfone"] });
    });

    /** Quem denuncia a falta de microfone é a plataforma ao recusar, e não a lista vazia. */
    it("fails when the platform says there is no microphone", async () => {
        const runtime = runtimeWith();
        runtime.microphone.failWith = Object.assign(new Error("Requested device not found"), {
            name: "NotFoundError",
        });

        const report = await runDiagnostics({ runtime, stunServers: [] });

        expect(report.readiness.OFFICIAL.blockedBy).toContain("MICROPHONE_MISSING");
        expect(report.readiness.UNOFFICIAL.blockedBy).toContain("MICROPHONE_MISSING");
    });

    /**
     * Num navegador ou num celular, lista vazia quer dizer que não há microfone ligado — e
     * sem microfone não há chamada, mesmo que a permissão tenha sido dada.
     */
    it("fails a platform that lists devices and found none", async () => {
        const runtime = runtimeWith();
        runtime.audio.listInputDevices = () => [];

        const report = await runDiagnostics({ runtime, stunServers: [] });

        expect(codesOf(report.checks)).toContain("MICROPHONE_MISSING");
        expect(report.readiness.OFFICIAL.ready).toBe(false);
    });

    /**
     * Num processo sem cabeça não há aparelho algum a enumerar: o áudio vem da fonte que o
     * integrador injetou. A mesma lista vazia ali não diz nada sobre a chamada poder
     * acontecer, e reprovar por ela diria que o ambiente não liga, quando ele liga.
     */
    it("does not fail a platform whose audio does not come from devices", async () => {
        const runtime = runtimeWith({ usesAudioDevices: false });
        runtime.audio.listInputDevices = () => [];
        runtime.audio.listOutputDevices = () => [];

        const report = await runDiagnostics({ runtime, stunServers: [] });

        expect(codesOf(report.checks)).not.toContain("MICROPHONE_MISSING");
        expect(report.readiness.OFFICIAL.ready).toBe(true);
        expect(report.readiness.UNOFFICIAL.ready).toBe(true);
    });

    it("says nothing about devices at all where they do not exist", async () => {
        const report = await runDiagnostics({ runtime: runtimeWith({ usesAudioDevices: false }), stunServers: [] });

        expect(codesOf(report.checks)).not.toContain("MICROPHONE_FOUND");
        expect(codesOf(report.checks)).not.toContain("SPEAKER_MISSING");
    });

    /**
     * Pedir a permissão é o ponto: sem ela a plataforma devolve entradas anônimas e o
     * diagnóstico não saberia dizer se a chamada vai sair.
     */
    it("asks for the microphone, and fails the environment when it is denied", async () => {
        const runtime = runtimeWith();
        runtime.microphone.failWith = Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });

        const report = await runDiagnostics({ runtime, stunServers: [] });
        const denied = report.checks.find((check) => check.code === "MICROPHONE_PERMISSION_DENIED");

        expect(denied?.details?.cause).toContain("Permission denied");
        expect(report.readiness.OFFICIAL.ready).toBe(false);
        expect(report.readiness.UNOFFICIAL.ready).toBe(false);
    });

    /**
     * O `open()` pode ser pedido mais de uma vez — ele devolve sempre o mesmo stream, então
     * não há dois acessos ao aparelho. O que importa é o fim: o microfone fechado, e o
     * indicador de gravação apagado.
     */
    it("leaves the microphone closed, so the recording indicator goes away", async () => {
        const runtime = runtimeWith();

        await runDiagnostics({ runtime, stunServers: [] });

        expect(runtime.microphone.isOpen).toBe(false);
        expect(runtime.microphone.closes).toBeGreaterThan(0);
    });

    /**
     * Regressão: o stream é o mesmo de todas as chamadas. Rodar o diagnóstico durante uma
     * chamada não pode fechá-lo, ou o áudio dela morre no meio.
     */
    it("leaves a microphone that was already open alone", async () => {
        const runtime = runtimeWith();
        await runtime.microphone.open();

        await runDiagnostics({ runtime, stunServers: [] });

        expect(runtime.microphone.closes).toBe(0);
        expect(runtime.microphone.isOpen).toBe(true);
    });

    /**
     * O ganho alto demais ceifa o sinal antes de chegar à biblioteca, e nada recupera o que
     * foi cortado. Quem fala não percebe — só quem ouve. Daí valer o aviso antes da chamada.
     */
    it("warns that the microphone is clipping, without failing the environment", async () => {
        const report = await withMicrophoneAudio(runtimeWith(), clippedAudio(1_600));

        const clipping = report.checks.find((check) => check.code === "MICROPHONE_CLIPPING");
        expect(clipping?.severity).toBe("warning");
        expect(clipping?.details?.clipping).toBeGreaterThan(0.5);
        // Estourado ainda liga: é ruim, não impeditivo.
        expect(report.readiness.OFFICIAL.ready).toBe(true);
    });

    /** Sinal forte não é sinal estourado: um medidor de nível sozinho confundiria os dois. */
    it("says nothing about gain when the microphone is loud but clean", async () => {
        const report = await withMicrophoneAudio(runtimeWith(), cleanAudio(1_600));

        expect(codesOf(report.checks)).not.toContain("MICROPHONE_CLIPPING");
    });

    /**
     * Mede pelo `capturePcm` porque é o único caminho que entrega amostras em toda
     * plataforma — no React Native o medidor do motor não vê o áudio da chamada oficial.
     */
    it("listens through the capture path, which every platform implements", async () => {
        const runtime = runtimeWith();
        await withMicrophoneAudio(runtime, cleanAudio(160));

        expect(runtime.engine.capturedFrom).toBe(runtime.microphone);
        expect(runtime.engine.captured[0].stopped).toBe(true);
    });

    it("warns when there is no output, without failing the call", async () => {
        const runtime = runtimeWith();
        runtime.audio.listOutputDevices = () => [];

        const report = await runDiagnostics({ runtime, stunServers: [] });

        expect(codesOf(report.checks)).toContain("SPEAKER_MISSING");
        expect(report.readiness.OFFICIAL.ready).toBe(true);
    });
});
