import type { IncomingCall } from "@wavoip/wavoip-api/node";
import {
    type CallRecording,
    buildRuntime,
    connect,
    reportEnvironment,
    requireToken,
    saveRecording,
    watchAudio,
} from "./shared.ts";

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

async function answer(offer: IncomingCall, recording: CallRecording): Promise<void> {
    console.log(`\nchamada de ${offer.peer.phone}`);

    const { data: call, error } = await offer.accept();
    if (error) {
        console.error("não deu para atender:", error.code);
        return;
    }

    console.log("atendida; tocando a saudação");
    call.on("ended", () => saveRecording(recording, "recebida"));
    call.on("failed", (failure) => console.error("a chamada caiu:", failure.code));

    watchAudio(call);
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
