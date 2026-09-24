import { element, type Log } from "@/dev/ui";
import type { ActiveCall, CallStats, IceDiagnostics } from "@/index";

// A cadência é de quem lê: 4x por segundo dá para ver número mexendo sem virar ruído.
const REFRESH_MS = 250;

/** Tudo que a API pública conta sobre a chamada, ao vivo e num lugar só. */
export function debugPanel(call: ActiveCall, log: Log): HTMLElement {
    const panel = element("section", "panel debug");
    panel.appendChild(element("h2", undefined, `Debug · ${call.type} · ${call.id}`));

    const grid = element("div", "grid");
    panel.appendChild(grid);
    const show = metrics(grid);

    panel.append(iceLine(call), issuesLine(call, log));
    poll(call, panel, show);
    return panel;
}

type Metrics = ReturnType<typeof metrics>;

function metrics(grid: HTMLElement) {
    return {
        rtt: metric(grid, "rtt min/avg/max"),
        total: metric(grid, "latência total"),
        network: metric(grid, "· rede"),
        whatsapp: metric(grid, "· whatsapp"),
        jitter: metric(grid, "· fila de reprodução"),
        playout: metric(grid, "· saída do aparelho"),
        tx: metric(grid, "tx nível/bitrate"),
        rx: metric(grid, "rx nível/bitrate/jitter"),
        packetsTx: metric(grid, "tx pacotes/perda/bytes"),
        packetsRx: metric(grid, "rx pacotes/perda/bytes"),
    };
}

/** Cada métrica devolve o próprio setter: o painel escreve por cima, sem recriar nó. */
function metric(grid: HTMLElement, label: string): (value: string) => void {
    const value = element("span", "metric-value", "—");
    grid.append(element("span", "metric-label", label), value);
    return (text: string) => {
        value.textContent = text;
    };
}

function poll(call: ActiveCall, panel: HTMLElement, show: Metrics): void {
    const timer = setInterval(async () => {
        if (!panel.isConnected) return clearInterval(timer);
        render(show, await call.getStats());
    }, REFRESH_MS);
}

function render(show: Metrics, stats: CallStats): void {
    show.rtt(`${ms(stats.rtt.min)} / ${ms(stats.rtt.avg)} / ${ms(stats.rtt.max)}`);
    show.total(ms(stats.latency.total_ms));
    show.network(ms(stats.latency.network_ms));
    show.whatsapp(ms(stats.latency.whatsapp_ms));
    show.jitter(ms(stats.latency.jitter_buffer_ms));
    show.playout(ms(stats.latency.playout_ms));
    show.tx(`${level(stats.audio.tx.level)} / ${kbps(stats.audio.tx.bitrate_kbps)}`);
    show.rx(`${level(stats.audio.rx.level)} / ${kbps(stats.audio.rx.bitrate_kbps)} / ${ms(stats.audio.rx.jitter_ms)}`);
    show.packetsTx(`${stats.packets.tx.sent} / ${stats.packets.tx.lost} / ${bytes(stats.packets.tx.bytes)}`);
    show.packetsRx(`${stats.packets.rx.received} / ${stats.packets.rx.lost} / ${bytes(stats.packets.rx.bytes)}`);
}

function iceLine(call: ActiveCall): HTMLElement {
    const line = element("p", "state", "ice: aguardando");
    call.on("iceDiagnostics", (diag) => {
        line.textContent = `ice: ${describeIce(diag)}`;
    });
    return line;
}

function issuesLine(call: ActiveCall, log: Log): HTMLElement {
    const line = element("p", "state", "conectividade: sem problema");
    const seen: string[] = [];
    call.on("connectivityIssue", (issue) => {
        seen.push(issue);
        line.textContent = `conectividade: ${seen.join(", ")}`;
        log.write(`debug: ${issue}`);
    });
    return line;
}

function describeIce(diag: IceDiagnostics): string {
    const candidates = Object.entries(diag.candidatesByType)
        .map(([kind, count]) => `${kind} ${count}`)
        .join(" · ");
    const timeout = diag.gatheringTimedOut ? " (estourou o teto)" : "";
    return `${diag.gatheringDurationMs}ms${timeout} · ${candidates} · stun ${yesNo(diag.stunReached)}`;
}

/** `null` é "não medido aqui", e o painel não pode mostrá-lo como zero. */
function ms(value: number | null): string {
    return value === null ? "—" : `${value.toFixed(1)}ms`;
}

function level(value: number): string {
    return value.toFixed(2);
}

function kbps(value: number): string {
    return `${value.toFixed(0)}kbps`;
}

function bytes(value: number): string {
    return `${(value / 1024).toFixed(1)}KiB`;
}

function yesNo(value: boolean): string {
    return value ? "sim" : "não";
}
