import type {
    ActiveCall,
    CallStats,
    ConnectivityIssue,
    Device,
    IceDiagnostics,
    IncomingCall,
    OutgoingCall,
} from "@wavoip/wavoip-api/node";

/** Os três — oferta, chamada que sai e chamada de pé — relatam ICE do mesmo jeito. */
type IceWatcher = {
    on(event: "iceDiagnostics", callback: (diag: IceDiagnostics) => void): unknown;
    on(event: "connectivityIssue", callback: (issue: ConnectivityIssue) => void): unknown;
};

const startedAt = Date.now();
const TICK_MS = 1_000;

/**
 * Narra a chamada inteira no console: cada evento, o que o ICE juntou e o que os pacotes
 * dizem, sempre com o tempo desde o início.
 *
 * O tempo é o que responde as perguntas que importam quando a chamada não conecta: quanto
 * tempo a coleta de candidatos levou, quanto tempo o contato ficou tocando, e se os pacotes
 * começaram a andar depois de o transporte dizer "connected".
 */
function line(scope: string, message: string): void {
    const elapsed = ((Date.now() - startedAt) / 1_000).toFixed(1).padStart(6);
    console.log(`${elapsed}s ${scope.padEnd(7)} ${message}`);
}

function device(target: Device): void {
    line("device", `status ${target.status} · conexão ${target.connectionStatus}`);
    target.on("statusChanged", (status) => line("device", `status → ${status}`));
    target.on("connectionStatusChanged", (status) => line("device", `conexão → ${status}`));
    target.on("contactChanged", (contact) => line("device", `número ${contact?.phone ?? "nenhum"}`));
    target.on("activeCallsChanged", (count) => line("device", `${count} chamada(s) ativa(s) no device`));
    target.on("restrictionChanged", (restriction) =>
        line(
            "device",
            restriction ? `restrito até ${restriction.until?.toISOString() ?? "sem prazo"}` : "sem restrição",
        ),
    );
}

/** A chamada que sai, do primeiro toque ao desfecho. */
function outgoing(call: OutgoingCall): void {
    line("call", `${call.id} · ${call.type} · para ${call.peer.phone} · status ${call.status}`);
    const ringingSince = Date.now();
    ice(call);
    call.on("ringing", () => line("call", "o servidor confirmou: o aparelho do contato está tocando"));
    call.on("rejected", () => line("call", "o contato recusou"));
    call.on("unanswered", () => line("call", "ninguém atendeu"));
    call.on("ended", () => line("call", `oferta encerrada · status ${call.status}`));
    call.on("failed", (failure) => line("call", `falhou: ${failure.code}${causeOf(failure.cause)}`));
    call.on("accepted", (active) => {
        line("call", `atendida depois de ${((Date.now() - ringingSince) / 1_000).toFixed(1)}s de toque`);
        activeCall(active);
    });
}

/** A chamada que chega, até alguém atender ou desistir. */
function incoming(call: IncomingCall): void {
    line("offer", `${call.id} · ${call.type} · de ${call.peer.phone} · status ${call.status}`);
    ice(call);
    call.on("cancelled", () => line("offer", "o contato desistiu antes de atendermos"));
    call.on("acceptedElsewhere", () => line("offer", "atendida em outro aparelho do mesmo número"));
    call.on("rejectedElsewhere", () => line("offer", "recusada em outro aparelho do mesmo número"));
    call.on("ended", () => line("offer", `oferta encerrada · status ${call.status}`));
}

/** A chamada de pé: é aqui que dá para ver se a mídia realmente andou. */
function activeCall(call: ActiveCall): void {
    line("media", `${call.type} · conexão ${call.connection}`);
    ice(call);
    call.on("connectionChanged", (connection) => line("media", `conexão → ${connection}`));
    call.on("peerMuteChanged", (muted) => line("media", muted ? "o contato mutou" : "o contato desmutou"));
    call.on("failed", (failure) => line("media", `caiu: ${failure.code}${causeOf(failure.cause)}`));
    call.on("ended", () => line("media", "encerrada"));
    watch(call);
}

/**
 * Uma linha de áudio e uma de rede por segundo.
 *
 * As duas juntas separam os dois jeitos de a chamada "não funcionar": nível parado em zero é
 * a fonte; nível andando com `tx` parado é a rede, e aí o ICE acima diz por quê.
 */
function watch(call: ActiveCall): void {
    const timer = setInterval(async () => {
        const out = call.audio.out;
        const incomingAudio = call.audio.in;
        line(
            "áudio",
            `saída ${bar(out.level())} ${pct(out.level())}   entrada ${bar(incomingAudio.level())} ${pct(incomingAudio.level())}${clipping(out.clipping(), incomingAudio.clipping())}`,
        );
        line("rede", network(await call.getStats()));
    }, TICK_MS);

    call.on("ended", () => clearInterval(timer));
    call.on("failed", () => clearInterval(timer));
}

function network(stats: CallStats): string {
    const { tx, rx } = stats.packets;
    return [
        `rtt ${Math.round(stats.rtt.avg)}ms`,
        `tx ${tx.sent} pac / ${tx.lost} perd / ${stats.audio.tx.bitrate_kbps.toFixed(0)} kbps`,
        `rx ${rx.received} pac / ${rx.lost} perd / ${stats.audio.rx.bitrate_kbps.toFixed(0)} kbps`,
        `jitter ${Math.round(stats.audio.rx.jitter_ms)}ms`,
    ].join(" · ");
}

/**
 * O ICE é a primeira coisa a olhar numa chamada oficial que não conecta: sem candidato
 * `srflx` o outro lado não tem para onde mandar áudio, e o `gatheringTimedOut` diz que a
 * biblioteca desistiu de esperar o STUN.
 */
function ice(call: IceWatcher): void {
    call.on("iceDiagnostics", (diag) => line("ice", describeIce(diag)));
    call.on("connectivityIssue", (issue) => line("ice", `problema: ${issue}`));
}

function describeIce(diag: IceDiagnostics): string {
    const candidates = Object.entries(diag.candidatesByType)
        .map(([kind, count]) => `${kind} ${count}`)
        .join(" ");
    const pair = diag.selectedCandidatePair;
    return [
        `coleta ${diag.gatheringDurationMs}ms${diag.gatheringTimedOut ? " (esgotou o tempo)" : ""}`,
        candidates,
        `stun ${diag.stunReached ? "ok" : "não alcançado"}`,
        `turn ${diag.turnReached ? "ok" : "não usado"}`,
        pair ? `par ${pair.local}→${pair.remote}` : "sem par escolhido",
    ].join(" · ");
}

function causeOf(cause: unknown): string {
    if (cause === undefined) return "";
    if (cause instanceof Error) return ` — ${cause.message}`;
    return ` — ${typeof cause === "string" ? cause : JSON.stringify(cause)}`;
}

function bar(level: number): string {
    const filled = Math.min(10, Math.round(level * 20));
    return `[${"#".repeat(filled)}${" ".repeat(10 - filled)}]`;
}

function pct(level: number): string {
    return `${String(Math.round(level * 100)).padStart(3)}%`;
}

function clipping(out: number, incoming: number): string {
    if (out > 0.02) return `   ⚠ a sua saída está estourando (${Math.round(out * 100)}%)`;
    if (incoming > 0.02) return `   ⚠ o contato está estourando (${Math.round(incoming * 100)}%)`;
    return "";
}

export const Trace = { line, device, outgoing, incoming, activeCall };
