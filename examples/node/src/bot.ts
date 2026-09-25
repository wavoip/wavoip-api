import {
    type ActiveCall,
    type Device,
    type IncomingCall,
    nodeRuntime,
    runDiagnostics,
    Wavoip,
    type WavoipRuntime,
} from "@wavoip/wavoip-api/node";
import { greetingSource, recordingSink } from "./audio.ts";
import { writeWav } from "./wav.ts";

const CALL_RATE = 16_000;

type Recording = ReturnType<typeof recordingSink>;

/**
 * Um bot que atende chamadas, toca uma saudação e grava o que o contato falou.
 *
 * É o menor exemplo que exercita o caminho inteiro do runtime de Node: diagnóstico, conexão
 * com o device, oferta recebida, áudio nas duas direções e desligamento.
 */
async function main(): Promise<void> {
    const token = process.env.WAVOIP_TOKEN;
    if (!token) exitWith("defina WAVOIP_TOKEN com o token do seu device");

    const recording = recordingSink();
    const runtime = nodeRuntime({ source: greetingSource(), sink: recording });

    await reportEnvironment(runtime);

    const wavoip = new Wavoip({ tokens: [token], runtime });
    wavoip.on("offer", (offer) => void answer(offer, recording));

    watchDevice(wavoip.devices[0]);
    console.log("esperando chamada… (ctrl+c para sair)");
}

/**
 * O diagnóstico primeiro: num processo sem cabeça ninguém vê o microfone mudo ou o STUN
 * bloqueado, e a chamada falharia sem explicação.
 */
async function reportEnvironment(runtime: WavoipRuntime): Promise<void> {
    const report = await runDiagnostics({ runtime });

    for (const check of report.checks) {
        console.log(` ${mark(check.severity)} ${check.code}`, check.details ?? "");
    }
    if (!report.readiness.OFFICIAL.ready && !report.readiness.UNOFFICIAL.ready) {
        exitWith(`o ambiente não aguenta chamada: ${report.readiness.OFFICIAL.blockedBy.join(", ")}`);
    }
}

async function answer(offer: IncomingCall, recording: Recording): Promise<void> {
    console.log(`\nchamada de ${offer.peer.phone}`);

    const { data: call, error } = await offer.accept();
    if (error) {
        console.error("não deu para atender:", error.code);
        return;
    }

    console.log("atendida; tocando a saudação");
    call.on("ended", () => saveRecording(recording));
    call.on("failed", (failure) => console.error("a chamada caiu:", failure.code));

    reportQuality(call);
}

/**
 * O estouro é o defeito que quem fala nunca percebe: vale olhar durante a chamada, e não só
 * no diagnóstico, porque o ganho pode mudar no meio.
 */
function reportQuality(call: ActiveCall): void {
    const timer = setInterval(() => {
        const clipping = call.audio.in.clipping();
        if (clipping > 0.02) console.warn(`  o áudio do contato está estourando (${(clipping * 100).toFixed(0)}%)`);
    }, 1_000);

    call.on("ended", () => clearInterval(timer));
}

function saveRecording(recording: Recording): void {
    const path = `chamada-${Date.now()}.wav`;
    writeWav(path, recording.blocks, CALL_RATE);
    console.log(`chamada encerrada; ${recording.seconds.toFixed(1)}s gravados em ${path}\n`);
    recording.blocks.length = 0;
}

function watchDevice(device: Device | undefined): void {
    device?.on("statusChanged", (status) => console.log(`device: ${status}`));
    device?.on("connectionStatusChanged", (status) => console.log(`conexão: ${status}`));
}

function mark(severity: "ok" | "warning" | "failure"): string {
    if (severity === "ok") return "✓";
    return severity === "warning" ? "!" : "✗";
}

function exitWith(message: string): never {
    console.error(message);
    process.exit(1);
}

main().catch((error: unknown) => exitWith(String(error)));
