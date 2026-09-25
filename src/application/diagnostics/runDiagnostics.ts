import { Readiness } from "@/domain/diagnostics/readiness";
import type { DiagnosticCheck, DiagnosticsReport } from "@/domain/diagnostics/types";
import { runStunProbe } from "@/modules/media/StunProbe";
import type { WavoipRuntime } from "@/ports/WavoipRuntime";

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
        return [{ code: "MICROPHONE_PERMISSION_DENIED", severity: "failure", details: { cause: String(cause) } }];
    }

    try {
        return deviceChecks(runtime);
    } finally {
        if (!wasOpen) await runtime.microphone.close().catch(() => {});
    }
}

/** Com a permissão dada, a lista vem com nome e conta o que existe de verdade. */
function deviceChecks(runtime: WavoipRuntime): DiagnosticCheck[] {
    const inputs = runtime.audio.listInputDevices();
    const outputs = runtime.audio.listOutputDevices();

    const checks: DiagnosticCheck[] = [
        inputs.length === 0
            ? { code: "MICROPHONE_MISSING", severity: "failure" }
            : { code: "MICROPHONE_FOUND", severity: "ok", details: { count: inputs.length, names: nameOf(inputs) } },
    ];

    // Um processo sem cabeça não tem alto-falante e não deveria ser reprovado por isso; quem
    // tem lista de saída e ela vem vazia é que perdeu o aparelho.
    if (outputs.length === 0 && inputs.length > 0) {
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
