import type { IncomingCall } from "@wavoip/wavoip-api/node";
import { type CallRecording, buildRuntime, connect, reportEnvironment, requireToken, saveRecording } from "./shared.ts";
import { Trace } from "./trace.ts";

/**
 * Atende as chamadas que chegam, toca a saudação e grava o que o contato falou.
 *
 * `WAVOIP_TOKEN=... npm run answer`
 */
async function main(): Promise<void> {
    const { runtime, recording } = buildRuntime();

    // O diagnóstico antes do token: quem ainda não tem um device consegue ver se a máquina
    // aguenta chamada.
    await reportEnvironment(runtime);

    const wavoip = connect(requireToken(), runtime);
    wavoip.on("offer", (offer) => void answer(offer, recording));

    Trace.line("pronto", "esperando chamada… (ctrl+c para sair)");
}

async function answer(offer: IncomingCall, recording: CallRecording): Promise<void> {
    Trace.incoming(offer);

    const { data: call, error } = await offer.accept();
    if (error) {
        Trace.line("offer", `não deu para atender: ${error.code}`);
        return;
    }

    Trace.activeCall(call);
    call.on("ended", () => saveRecording(recording, "recebida"));
    call.on("failed", () => saveRecording(recording, "recebida"));
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
