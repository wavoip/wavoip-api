import { ClipDetector } from "@/domain/audio/ClipDetector";
import { Readiness } from "@/domain/diagnostics/readiness";
import type { DiagnosticCheck, DiagnosticsReport } from "@/domain/diagnostics/types";
import { runStunProbe } from "@/modules/media/StunProbe";
import type { WavoipRuntime } from "@/ports/WavoipRuntime";

/** Tempo de escuta do microfone: o bastante para uma sílaba, curto o bastante para ninguém notar. */
const GAIN_SAMPLE_MS = 300;
/** Acima disto o estouro já se ouve; abaixo, é pico ocasional de quem falou mais alto. */
const CLIPPING_LIMIT = 0.02;

const DEFAULT_STUN_SERVERS = ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"];

export type DiagnosticsOptions = {
    /** The platform to check. The same one you hand to `new Wavoip(...)`. */
    runtime: WavoipRuntime;
    /** Servers to probe. Defaults to two public ones; pass your own to check yours. */
    stunServers?: string[];
};

/**
 * Checks whether this environment can carry a call, and says what is missing when it cannot.
 *
 * It asks the runtime, never the platform: the same call works in a browser, in Node and in
 * React Native, and each answers for itself. Nothing here opens a call or asks the person for
 * anything — running it on a blank page is safe.
 */
export async function runDiagnostics({ runtime, stunServers }: DiagnosticsOptions): Promise<DiagnosticsReport> {
    const checks: DiagnosticCheck[] = [
        ...(await audioChecks(runtime)),
        ...(await microphoneChecks(runtime)),
        ...transportChecks(runtime),
        ...(await networkChecks(runtime, stunServers ?? DEFAULT_STUN_SERVERS)),
    ];

    return { checks, readiness: Readiness.of(checks) };
}

/**
 * Subir o motor é o que separa "a plataforma bloqueou" de "o áudio quebrou": o navegador
 * deixa o `AudioContext` suspenso até alguém tocar na tela, e isso não é defeito nenhum —
 * é a chamada que vai sair muda se ninguém avisar a pessoa.
 */
async function audioChecks(runtime: WavoipRuntime): Promise<DiagnosticCheck[]> {
    try {
        await runtime.engine.prepare();
        await runtime.engine.resume();
    } catch (cause) {
        return [{ code: "AUDIO_ENGINE_FAILED", severity: "failure", details: { cause: String(cause) } }];
    }

    if (runtime.engine.state === "running") return [{ code: "AUDIO_RUNNING", severity: "ok" }];
    return [{ code: "USER_GESTURE_REQUIRED", severity: "warning", details: { state: runtime.engine.state } }];
}

/**
 * Abre o microfone, e é de propósito que abra: sem permissão a plataforma não conta o que está
 * ligado — devolve entradas anônimas, e às vezes nem isso. Um diagnóstico que não pede a
 * permissão não responde à pergunta que ele existe para responder, que é se a chamada vai sair.
 *
 * Fecha só se foi ele que abriu. O stream é o mesmo de todas as chamadas: fechar um que uma
 * chamada está usando cortaria o áudio dela no meio.
 */
async function microphoneChecks(runtime: WavoipRuntime): Promise<DiagnosticCheck[]> {
    const wasOpen = runtime.microphone.isOpen;

    try {
        await runtime.microphone.open();
    } catch (cause) {
        return [refusalOf(cause)];
    }

    try {
        return [...deviceChecks(runtime), ...(await gainCheck(runtime))];
    } finally {
        if (!wasOpen) await runtime.microphone.close().catch(() => {});
    }
}

/**
 * Escuta o microfone por um instante para ver se ele está estourando.
 *
 * Ganho alto demais — no sistema ou num botão do próprio aparelho — ceifa o sinal antes de
 * chegar aqui, e nada recupera o que foi cortado: a voz sai áspera do outro lado, e quem
 * fala não percebe. É o tipo de problema que só quem está do lado de cá pode resolver, e
 * por isso vale avisar antes da chamada começar.
 *
 * Mede pelo `capturePcm`, e não pelo medidor do motor, porque é o caminho que entrega as
 * amostras em toda plataforma: no navegador vem do worklet, no Node da fonte do integrador e
 * no React Native do gravador nativo — que é o único jeito de o áudio chegar ao JavaScript
 * lá. O medidor do motor não serve: no React Native ele não vê nada.
 */
async function gainCheck(runtime: WavoipRuntime): Promise<DiagnosticCheck[]> {
    const clip = new ClipDetector();
    const capture = await runtime.engine.capturePcm(runtime.microphone, (pcm) => clip.push(new Int16Array(pcm)));

    try {
        await listenFor(GAIN_SAMPLE_MS);
        if (clip.fraction < CLIPPING_LIMIT) return [];

        return [{ code: "MICROPHONE_CLIPPING", severity: "warning", details: { clipping: clip.fraction } }];
    } finally {
        capture.stop();
    }
}

function listenFor(ms: number): Promise<void> {
    return new Promise((done) => setTimeout(done, ms));
}

/**
 * Por que o microfone não abriu. A plataforma diz a diferença entre "ninguém deixou" e "não
 * há aparelho", e são coisas distintas para quem lê: uma se resolve na caixa de permissão, a
 * outra ligando um microfone.
 */
function refusalOf(cause: unknown): DiagnosticCheck {
    const name = (cause as { name?: unknown })?.name;
    const details = { cause: String(cause) };

    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        return { code: "MICROPHONE_MISSING", severity: "failure", details };
    }
    return { code: "MICROPHONE_PERMISSION_DENIED", severity: "failure", details };
}

/**
 * Com o microfone aberto, a lista diz o que existe — e nome só aparece depois da permissão.
 *
 * O que uma lista vazia significa depende da plataforma, e por isso ela é quem diz: num
 * navegador ou num celular quer dizer que não há microfone ligado, e sem ele não há chamada;
 * num processo sem cabeça não há aparelho algum a enumerar, porque o áudio é a fonte que o
 * integrador injetou.
 */
function deviceChecks(runtime: WavoipRuntime): DiagnosticCheck[] {
    if (!runtime.usesAudioDevices) return [];

    const inputs = runtime.audio.listInputDevices();
    if (inputs.length === 0) return [{ code: "MICROPHONE_MISSING", severity: "failure" }];

    const checks: DiagnosticCheck[] = [
        { code: "MICROPHONE_FOUND", severity: "ok", details: { count: inputs.length, names: nameOf(inputs) } },
    ];
    // Quem tem lista de entrada e não tem a de saída perdeu o aparelho no caminho.
    if (runtime.audio.listOutputDevices().length === 0) {
        checks.push({ code: "SPEAKER_MISSING", severity: "warning" });
    }
    return checks;
}

function nameOf(devices: readonly { label: string }[]): string[] {
    return devices.map((device) => device.label).filter((label) => label !== "");
}

function transportChecks(runtime: WavoipRuntime): DiagnosticCheck[] {
    return [
        runtime.createPeer
            ? { code: "WEBRTC_AVAILABLE", severity: "ok" }
            : { code: "WEBRTC_MISSING", severity: "failure" },
        runtime.openSocket
            ? { code: "BINARY_SOCKET_AVAILABLE", severity: "ok" }
            : { code: "BINARY_SOCKET_MISSING", severity: "failure" },
    ];
}

/** Sem WebRTC não há o que sondar: a sonda de STUN é feita de conexão. */
async function networkChecks(runtime: WavoipRuntime, servers: string[]): Promise<DiagnosticCheck[]> {
    const { createPeer } = runtime;
    if (!createPeer || servers.length === 0) return [];

    const probed = await runStunProbe(servers, createPeer);
    const reachable = probed.filter((result) => result.reachable);
    const details = { reachable: reachable.length, probed: probed.length, servers: probed };

    if (reachable.length === 0) return [{ code: "STUN_UNREACHABLE", severity: "warning", details }];
    return [{ code: "STUN_REACHABLE", severity: "ok", details }];
}
