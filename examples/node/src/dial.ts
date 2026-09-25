import type { OutgoingCall } from "@wavoip/wavoip-api/node";
import {
    type CallRecording,
    buildRuntime,
    connect,
    describeFailure,
    exitWith,
    reportEnvironment,
    requireToken,
    saveRecording,
    watchAudio,
} from "./shared.ts";

const RING_TIMEOUT_MS = 45_000;

/**
 * Liga para um número, toca a saudação quando atenderem e grava a conversa.
 *
 * `WAVOIP_TOKEN=... npm run dial -- 5511999999999`
 */
async function main(): Promise<void> {
    const to = process.argv[2];
    if (!to) exitWith("informe o número: npm run dial -- 5511999999999");

    const token = requireToken();
    const { runtime, recording } = buildRuntime();

    await reportEnvironment(runtime);

    const wavoip = connect(token, runtime);
    await dial(wavoip, to, recording);
}

async function dial(wavoip: ReturnType<typeof connect>, to: string, recording: CallRecording): Promise<void> {
    console.log(`\nligando para ${to}…`);

    const { data: outgoing, error } = await wavoip.startCall({ to });
    if (error) {
        // `error.devices` diz por que cada device recusou, e é o que explica um `NO_DEVICE`.
        for (const attempt of error.devices) console.error(`  ${attempt.token}: ${attempt.error.code}`);
        exitWith(`não deu para ligar: ${error.code}`);
    }

    watchOutgoing(outgoing, recording);
    giveUpAfter(outgoing, RING_TIMEOUT_MS);
}

function watchOutgoing(outgoing: OutgoingCall, recording: CallRecording): void {
    outgoing.on("accepted", (call) => {
        console.log("atenderam; tocando a saudação");
        call.on("ended", () => finish(recording));
        call.on("failed", (failure) => console.error("a chamada caiu:", describeFailure(failure)));
        watchAudio(call);
    });

    outgoing.on("rejected", () => finish(recording, "recusaram"));
    outgoing.on("unanswered", () => finish(recording, "ninguém atendeu"));
    outgoing.on("failed", (failure) => finish(recording, `falhou: ${describeFailure(failure)}`));
    outgoing.on("ended", () => finish(recording, "o servidor encerrou a oferta"));
}

/**
 * Desistir é decisão nossa, e não do servidor: sem isto o processo ficaria tocando até o
 * outro lado resolver alguma coisa.
 */
function giveUpAfter(outgoing: OutgoingCall, ms: number): void {
    const timer = setTimeout(() => void outgoing.cancel(), ms);
    outgoing.on("accepted", () => clearTimeout(timer));
    outgoing.on("ended", () => clearTimeout(timer));
}

function finish(recording: CallRecording, reason?: string): void {
    if (reason) console.log(reason);
    saveRecording(recording, "feita");
    process.exit(0);
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
