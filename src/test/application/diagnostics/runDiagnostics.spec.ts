import { runDiagnostics } from "@/application/diagnostics/runDiagnostics";
import type { DiagnosticCode } from "@/domain/diagnostics/types";
import { type FakeAudioEngine, FakeAudioRuntime, type FakeMicrophone } from "@/test/fakes/FakeAudioRuntime";
import type { WavoipRuntime } from "@/ports/WavoipRuntime";
import { describe, expect, it, vi } from "vitest";

/** Um runtime completo de mentira, para cada teste tirar dele só o que quer provar. */
/**
 * Roda o diagnóstico com o microfone entregando a fração de estouro pedida. O medidor é
 * criado dentro da verificação, então o valor é ajustado assim que ele aparece.
 */
async function withClipping(runtime: ReturnType<typeof runtimeWith>, fraction: number) {
    const pending = runDiagnostics({ runtime, stunServers: [] });
    await vi.waitFor(() => expect(runtime.engine.monitored.length).toBeGreaterThan(0));
    for (const meter of runtime.engine.monitored) meter.clipped = fraction;
    return pending;
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

    it("fails when there is no microphone at all, for either call type", async () => {
        const runtime = runtimeWith();
        runtime.audio.listInputDevices = () => [];

        const report = await runDiagnostics({ runtime, stunServers: [] });

        expect(report.readiness.OFFICIAL.blockedBy).toContain("MICROPHONE_MISSING");
        expect(report.readiness.UNOFFICIAL.blockedBy).toContain("MICROPHONE_MISSING");
    });

    /**
     * Pedir a permissão é o ponto: sem ela a plataforma devolve entradas anônimas e o
     * diagnóstico não saberia dizer se a chamada vai sair.
     */
    it("asks for the microphone, and fails the environment when it is denied", async () => {
        const runtime = runtimeWith();
        runtime.microphone.failWith = new Error("NotAllowedError: Permission denied");

        const report = await runDiagnostics({ runtime, stunServers: [] });
        const denied = report.checks.find((check) => check.code === "MICROPHONE_PERMISSION_DENIED");

        expect(denied?.details?.cause).toContain("Permission denied");
        expect(report.readiness.OFFICIAL.ready).toBe(false);
        expect(report.readiness.UNOFFICIAL.ready).toBe(false);
    });

    it("closes the microphone it opened, so the recording indicator goes away", async () => {
        const runtime = runtimeWith();

        await runDiagnostics({ runtime, stunServers: [] });

        expect(runtime.microphone.opens).toBe(1);
        expect(runtime.microphone.closes).toBe(1);
        expect(runtime.microphone.isOpen).toBe(false);
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
        const runtime = runtimeWith();
        const report = await withClipping(runtime, 0.4);

        const clipping = report.checks.find((check) => check.code === "MICROPHONE_CLIPPING");
        expect(clipping?.severity).toBe("warning");
        expect(clipping?.details).toEqual({ clipping: 0.4 });
        // Estourado ainda liga: é ruim, não impeditivo.
        expect(report.readiness.OFFICIAL.ready).toBe(true);
    });

    it("says nothing about gain when the microphone behaves", async () => {
        const report = await withClipping(runtimeWith(), 0.001);

        expect(codesOf(report.checks)).not.toContain("MICROPHONE_CLIPPING");
    });

    it("warns when there is no output, without failing the call", async () => {
        const runtime = runtimeWith();
        runtime.audio.listOutputDevices = () => [];

        const report = await runDiagnostics({ runtime, stunServers: [] });

        expect(codesOf(report.checks)).toContain("SPEAKER_MISSING");
        expect(report.readiness.OFFICIAL.ready).toBe(true);
    });
});
