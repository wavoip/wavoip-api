import { runDiagnostics } from "@/application/diagnostics/runDiagnostics";
import type { DiagnosticCode } from "@/domain/diagnostics/types";
import { type FakeAudioEngine, FakeAudioRuntime } from "@/test/fakes/FakeAudioRuntime";
import type { WavoipRuntime } from "@/ports/WavoipRuntime";
import { describe, expect, it } from "vitest";

/** Um runtime completo de mentira, para cada teste tirar dele só o que quer provar. */
function runtimeWith(overrides: Partial<WavoipRuntime> = {}): WavoipRuntime & { engine: FakeAudioEngine } {
    const fake = new FakeAudioRuntime();
    return {
        engine: fake.engine,
        microphone: fake.microphone,
        audio: {
            listInputDevices: () => [{ id: "mic", label: "Microfone", kind: "input" as const }],
            listOutputDevices: () => [],
            currentInput: null,
            currentOutput: null,
            selectInput: async () => ({ data: null, error: { code: "INPUT_SELECTION_UNSUPPORTED" as const } }),
            selectOutput: async () => ({ data: null, error: { code: "OUTPUT_SELECTION_UNSUPPORTED" as const } }),
        },
        createPeer: fake.createPeer,
        openSocket: fake.openSocket,
        ...overrides,
    } as WavoipRuntime & { engine: FakeAudioEngine };
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

    it("counts the microphones it found", async () => {
        const report = await runDiagnostics({ runtime: runtimeWith(), stunServers: [] });
        const found = report.checks.find((check) => check.code === "MICROPHONE_FOUND");

        expect(found?.details).toEqual({ count: 1 });
    });

    it("fails when there is no microphone at all, for either call type", async () => {
        const runtime = runtimeWith();
        runtime.audio.listInputDevices = () => [];

        const report = await runDiagnostics({ runtime, stunServers: [] });

        expect(report.readiness.OFFICIAL.blockedBy).toContain("MICROPHONE_MISSING");
        expect(report.readiness.UNOFFICIAL.blockedBy).toContain("MICROPHONE_MISSING");
    });

    /** Nome vazio é o que a plataforma devolve enquanto a permissão não foi dada. */
    it("notices that the permission has not been granted yet, without asking for it", async () => {
        const runtime = runtimeWith();
        runtime.audio.listInputDevices = () => [{ id: "mic", label: "", kind: "input" }];

        const report = await runDiagnostics({ runtime, stunServers: [] });

        expect(codesOf(report.checks)).toContain("MICROPHONE_PERMISSION_PENDING");
        // Avisar não é reprovar: a chamada pede a permissão quando abrir.
        expect(report.readiness.OFFICIAL.ready).toBe(true);
        expect(runtime.microphone.muted).toBe(false);
    });
});
