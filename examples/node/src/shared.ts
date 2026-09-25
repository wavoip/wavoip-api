import { type Device, Wavoip, type WavoipRuntime, nodeRuntime, runDiagnostics } from "@wavoip/wavoip-api/node";
import { STUDIO_RATE, greetingSource, studioSink } from "./audio.ts";
import { Trace } from "./trace.ts";
import { writeStereoWav } from "./wav.ts";

export type Recording = ReturnType<typeof studioSink>;

/** Os dois lados da conversa: o que o contato falou e o que nós mandamos. */
export type CallRecording = { readonly peer: Recording; readonly self: Recording };

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
export function buildRuntime(): { runtime: WavoipRuntime; recording: CallRecording } {
    const recording = { peer: studioSink(), self: studioSink() };
    const runtime = nodeRuntime({
        source: greetingSource(process.env.WAVOIP_AUDIO),
        sink: recording.peer,
        // Sem isto a gravação teria só metade da conversa: o `sink` é o que o contato falou.
        outgoingSink: recording.self,
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
    if (device) Trace.device(device);
    return wavoip;
}

/**
 * Espera o servidor descrever o device antes de usá-lo.
 *
 * Ligar antes disso é recusado com `DEVICE_NOT_READY`: em `BUILDING` nem se sabe se o device
 * faz chamada oficial ou não oficial, e a biblioteca não chuta o transporte.
 */
export function waitForDevice(wavoip: Wavoip, timeoutMs = 20_000): Promise<Device> {
    const device = wavoip.devices[0];
    if (!device) return Promise.reject(new Error("o token não corresponde a nenhum device"));
    if (device.status !== "BUILDING") return Promise.resolve(device);

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`o device não saiu de BUILDING em ${timeoutMs}ms`)), timeoutMs);
        device.on("statusChanged", (status) => {
            if (status === "BUILDING") return;
            clearTimeout(timer);
            resolve(device);
        });
    });
}

/** Salva a conversa em dois canais: à esquerda o que mandamos, à direita o contato. */
export function saveRecording(recording: CallRecording, prefix: string): void {
    const { self, peer } = recording;
    if (self.blocks.length === 0 && peer.blocks.length === 0) {
        console.log("nada foi gravado");
        return;
    }

    const path = `${prefix}-${Date.now()}.wav`;
    writeStereoWav(path, self.blocks, peer.blocks, STUDIO_RATE);
    console.log(
        `gravado em ${path}: ${self.seconds.toFixed(1)}s seus, ${peer.seconds.toFixed(1)}s do contato (${STUDIO_RATE} Hz, 2 canais)`,
    );
    self.blocks.length = 0;
    peer.blocks.length = 0;
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
