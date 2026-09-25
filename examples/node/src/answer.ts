import type { ActiveCall, IncomingCall } from "@wavoip/wavoip-api/node";
import { type Recording, buildRuntime, connect, reportEnvironment, requireToken, saveRecording } from "./shared.ts";

/**
 * Atende as chamadas que chegam, toca a saudação e grava o que o contato falou.
 *
 * `WAVOIP_TOKEN=... npm run answer`
 */
async function main(): Promise<void> {
    const token = requireToken();
    const { runtime, recording } = buildRuntime();

    await reportEnvironment(runtime);

    const wavoip = connect(token, runtime);
    wavoip.on("offer", (offer) => void answer(offer, recording));

    console.log("\nesperando chamada… (ctrl+c para sair)");
}

async function answer(offer: IncomingCall, recording: Recording): Promise<void> {
    console.log(`\nchamada de ${offer.peer.phone}`);

    const { data: call, error } = await offer.accept();
    if (error) {
        console.error("não deu para atender:", error.code);
        return;
    }

    console.log("atendida; tocando a saudação");
    call.on("ended", () => saveRecording(recording, "recebida"));
    call.on("failed", (failure) => console.error("a chamada caiu:", failure.code));

    watchQuality(call);
}

/**
 * O estouro é o defeito que quem fala nunca percebe, só quem ouve — e o ganho do outro lado
 * pode mudar no meio da conversa, então não basta olhar no diagnóstico.
 */
function watchQuality(call: ActiveCall): void {
    const timer = setInterval(() => {
        const clipping = call.audio.in.clipping();
        if (clipping > 0.02) console.warn(`  o áudio do contato está estourando (${(clipping * 100).toFixed(0)}%)`);
    }, 1_000);

    call.on("ended", () => clearInterval(timer));
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
