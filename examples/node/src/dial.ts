import type { OutgoingCall } from "@wavoip/wavoip-api/node";
import {
    type CallRecording,
    buildRuntime,
    connect,
    exitWith,
    reportEnvironment,
    requireToken,
    saveRecording,
    waitForDevice,
} from "./shared.ts";
import { Trace } from "./trace.ts";

const RING_TIMEOUT_MS = 45_000;

/**
 * Liga para um número, toca a saudação quando atenderem e grava a conversa.
 *
 * `WAVOIP_TOKEN=... npm run dial -- 5511999999999`
 */
async function main(): Promise<void> {
    const to = process.argv[2];
    if (!to) exitWith("informe o número: npm run dial -- 5511999999999");

    const { runtime, recording } = buildRuntime();

    // O diagnóstico antes do token: quem ainda não tem um device consegue ver se a máquina
    // aguenta chamada.
    await reportEnvironment(runtime);

    const wavoip = connect(requireToken(), runtime);
    await waitForDevice(wavoip);

    await dial(wavoip, to, recording);
}

async function dial(wavoip: ReturnType<typeof connect>, to: string, recording: CallRecording): Promise<void> {
    Trace.line("call", `discando para ${to}`);

    const { data: outgoing, error } = await wavoip.startCall({ to });
    if (error) {
        // `error.devices` diz por que cada device recusou, e é o que explica um `NO_DEVICE`.
        for (const attempt of error.devices) Trace.line("call", `${attempt.token}: ${attempt.error.code}`);
        exitWith(`não deu para ligar: ${error.code}`);
    }

    Trace.outgoing(outgoing);
    saveWhenItIsOver(outgoing, recording);
    giveUpAfter(outgoing, RING_TIMEOUT_MS);
}

/** Qualquer desfecho grava o que deu tempo de gravar: quem narra o motivo é o `Trace`. */
function saveWhenItIsOver(outgoing: OutgoingCall, recording: CallRecording): void {
    const done = () => finish(recording);
    outgoing.on("rejected", done);
    outgoing.on("unanswered", done);
    outgoing.on("failed", done);
    outgoing.on("ended", done);
    outgoing.on("accepted", (call) => {
        call.on("ended", done);
        call.on("failed", done);
    });
}

/**
 * Desistir é decisão nossa, e não do servidor: sem isto o processo ficaria tocando até o
 * outro lado resolver alguma coisa.
 */
function giveUpAfter(outgoing: OutgoingCall, ms: number): void {
    const timer = setTimeout(() => {
        Trace.line("call", `${ms / 1_000}s de toque sem resposta: desistindo`);
        void outgoing.cancel();
    }, ms);
    outgoing.on("accepted", () => clearTimeout(timer));
    outgoing.on("ended", () => clearTimeout(timer));
}

function finish(recording: CallRecording): void {
    saveRecording(recording, "feita");
    process.exit(0);
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
