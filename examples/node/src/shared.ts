import { Wavoip, type WavoipRuntime, nodeRuntime, runDiagnostics } from "@wavoip/wavoip-api/node";
import { STUDIO_RATE, greetingSource, studioSink } from "./audio.ts";
import { writeWav } from "./wav.ts";

export type Recording = ReturnType<typeof studioSink>;

/**
 * Monta o runtime com conversão nos dois lados: entra o arquivo a 22,05 kHz e sai a 48 kHz.
 * Nenhuma das duas é a taxa da chamada, que é 16 kHz — é o cenário que mais tem chance de
 * revelar defeito, e o mais caro.
 *
 * `WAVOIP_AUDIO=./outro.wav` troca a saudação por qualquer WAV de 16 bits.
 *
 * A reamostragem vai para outro thread. Com uma chamada só seria exagero — é a partir de
 * algumas dezenas simultâneas que ela começa a segurar o event loop —, mas o exemplo liga
 * para mostrar onde fica a opção.
 */
export function buildRuntime(): { runtime: WavoipRuntime; recording: Recording } {
    const recording = studioSink();
    const runtime = nodeRuntime({
        source: greetingSource(process.env.WAVOIP_AUDIO),
        sink: recording,
        resampleInWorker: true,
    });
    return { runtime, recording };
}

/**
 * O diagnóstico antes da primeira chamada: num servidor ninguém vê o STUN bloqueado por um
 * firewall, e a chamada apenas não completaria, sem dizer por quê.
 */
export async function reportEnvironment(runtime: WavoipRuntime): Promise<void> {
    const report = await runDiagnostics({ runtime });

    for (const check of report.checks) {
        console.log(` ${mark(check.severity)} ${check.code}`, summarize(check.details));
    }
    if (!report.readiness.OFFICIAL.ready && !report.readiness.UNOFFICIAL.ready) {
        exitWith(`o ambiente não aguenta chamada: ${report.readiness.OFFICIAL.blockedBy.join(", ")}`);
    }
}

export function connect(token: string, runtime: WavoipRuntime): Wavoip {
    const wavoip = new Wavoip({ tokens: [token], runtime });
    const device = wavoip.devices[0];
    device?.on("statusChanged", (status) => console.log(`device: ${status}`));
    device?.on("connectionStatusChanged", (status) => console.log(`conexão: ${status}`));
    return wavoip;
}

export function saveRecording(recording: Recording, prefix: string): void {
    if (recording.blocks.length === 0) {
        console.log("nada foi gravado");
        return;
    }

    const path = `${prefix}-${Date.now()}.wav`;
    writeWav(path, recording.blocks, STUDIO_RATE);
    console.log(`${recording.seconds.toFixed(1)}s gravados em ${path} (${STUDIO_RATE} Hz)`);
    recording.blocks.length = 0;
}

export function requireToken(): string {
    const token = process.env.WAVOIP_TOKEN;
    if (!token) exitWith("defina WAVOIP_TOKEN com o token do seu device");
    return token;
}

export function exitWith(message: string): never {
    console.error(message);
    process.exit(1);
}

function mark(severity: "ok" | "warning" | "failure"): string {
    if (severity === "ok") return "✓";
    return severity === "warning" ? "!" : "✗";
}

function summarize(details: Record<string, unknown> | undefined): string {
    if (!details) return "";
    if (typeof details.count === "number") return `${details.count}`;
    if (typeof details.reachable === "number") return `${details.reachable}/${details.probed}`;
    if (typeof details.clipping === "number") return `${(details.clipping * 100).toFixed(0)}%`;
    return "";
}
