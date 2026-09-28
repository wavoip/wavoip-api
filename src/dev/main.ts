import { activePanel, incomingPanel } from "@/dev/callPanel";
import { devicePanel } from "@/dev/devicePanel";
import { audioPanel, stunPanel } from "@/dev/diagnostics";
import { dialer } from "@/dev/dialer";
import { button, createLog, element, field, type Log } from "@/dev/ui";
import { type ActiveCall, Wavoip, webRuntime } from "@/web";

// Os tokens são de quem está testando, e este repositório é público: ficam no navegador.
const TOKENS_KEY = "wavoip.dev.tokens";

function boot(): void {
    const app = document.querySelector<HTMLElement>("#app");
    if (!app) throw new Error('O index.html precisa de um <div id="app">');

    const log = createLog();
    const calls = element("div", "calls");
    const tokens = field("Tokens do dispositivo (separados por vírgula)", localStorage.getItem(TOKENS_KEY) ?? "");
    const gathering = field("Teto da coleta ICE (ms, opcional)", "");

    const connect = button("Conectar", () => {
        localStorage.setItem(TOKENS_KEY, tokens.input.value.trim());
        app.replaceChildren(start(listOf(tokens.input.value), Number(gathering.input.value) || undefined, calls, log));
        app.append(calls, log.node);
    });

    app.append(tokens.row, gathering.row, connect, calls, log.node);
}

/** Uma instância por conexão: reconectar é recarregar a página, como o integrador faria. */
function start(tokens: string[], gatheringTimeoutMs: number | undefined, calls: HTMLElement, log: Log): HTMLElement {
    const wavoip = new Wavoip({
        tokens,
        platform: "playground",
        runtime: webRuntime(),
        ...(gatheringTimeoutMs ? { iceConfig: { gatheringTimeoutMs } } : {}),
    });

    const showActive = (active: ActiveCall) => {
        log.write(`ativa: ${active.id} (${active.direction}, device ${active.deviceToken})`);
        calls.appendChild(activePanel(active, log));
    };

    wavoip.on("offer", (offer) => {
        log.write(`recebida: oferta de ${offer.peer.phone} no device ${offer.deviceToken}`);
        calls.appendChild(incomingPanel(offer, log, showActive));
    });

    const panel = element("section", "panel");
    panel.append(devices(wavoip, log), dialer(wavoip, calls, log, showActive), audioPanel(wavoip), stunPanel(log));
    return panel;
}

/** A lista de devices é viva: dá para somar e tirar token sem recarregar. */
function devices(wavoip: Wavoip, log: Log): HTMLElement {
    const box = element("div", "devices");
    const cards = element("div", "cards");
    const token = field("Token", "");

    const redraw = () => cards.replaceChildren(...wavoip.getDevices().map((device) => devicePanel(device, log)));
    const actions = element("div", "actions");
    actions.append(
        button("Somar", () => {
            const added = wavoip.addDevices(listOf(token.input.value));
            log.write(`somados ${added.length} dispositivos`);
            redraw();
        }),
        button("Tirar", () => {
            const removed = wavoip.removeDevices(listOf(token.input.value));
            log.write(`tirados ${removed.length} dispositivos`);
            redraw();
        }),
        button("Acordar em série", () => void wakeInSeries(wavoip, log)),
        button("Acordar em paralelo", () => void wakeInParallel(wavoip, log)),
    );

    box.append(cards, token.row, actions);
    redraw();
    return box;
}

/** O iterador conta um por um, na ordem em que respondem. */
async function wakeInSeries(wavoip: Wavoip, log: Log): Promise<void> {
    for await (const { token, result } of wavoip.wakeUpDevicesIterator()) {
        log.write(`wakeUp ${token}: ${result.error ? result.error.code : "ok"}`);
    }
}

/** A outra forma devolve uma Promise por device, para quem quer esperar todas juntas. */
async function wakeInParallel(wavoip: Wavoip, log: Log): Promise<void> {
    log.write(`acordando ${wavoip.devices.length} dispositivos`);
    for (const { token, result } of await Promise.all(wavoip.wakeUpDevices())) {
        log.write(`wakeUp ${token}: ${result.error ? result.error.code : "ok"}`);
    }
}

function listOf(value: string): string[] {
    return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

boot();
