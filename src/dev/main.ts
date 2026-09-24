import { activePanel, incomingPanel, outgoingPanel } from "@/dev/callPanel";
import { button, createLog, element, field, type Log } from "@/dev/ui";
import { type ActiveCall, type Device, Wavoip } from "@/index";

// O token é de quem está testando, e este repositório é público: ele fica no navegador.
const TOKEN_KEY = "wavoip.dev.token";

function boot(): void {
    const app = document.querySelector<HTMLElement>("#app");
    if (!app) throw new Error("O index.html precisa de um <div id=\"app\">");

    const log = createLog();
    const calls = element("div", "calls");
    const token = field("Token do dispositivo", localStorage.getItem(TOKEN_KEY) ?? "");

    const connect = button("Conectar", () => {
        localStorage.setItem(TOKEN_KEY, token.input.value.trim());
        app.replaceChildren(start(token.input.value.trim(), calls, log), calls, log.node);
    });

    app.append(token.row, connect, calls, log.node);
}

/** Uma instância por conexão: reconectar é recarregar a página, como o integrador faria. */
function start(token: string, calls: HTMLElement, log: Log): HTMLElement {
    const wavoip = new Wavoip({ tokens: [token], platform: "playground" });

    wavoip.on("offer", (offer) => {
        log.write(`recebida: oferta de ${offer.peer.phone}`);
        calls.appendChild(incomingPanel(offer, log, (active) => showActive(active, calls, log)));
    });

    const panel = element("section", "panel");
    panel.append(devicePanel(wavoip, log), dialer(wavoip, calls, log), audioPanel(wavoip));
    return panel;
}

function devicePanel(wavoip: Wavoip, log: Log): HTMLElement {
    const box = element("div", "device");
    const state = element("p", "state", "conectando…");
    box.append(element("h2", undefined, "Dispositivo"), state);

    const device = wavoip.devices[0];
    const describe = () => {
        const current = wavoip.devices[0];
        state.textContent = `${current.status} · ${current.connectionStatus} · ${current.contact?.phone ?? "sem número"} · ${current.activeCalls} em curso`;
    };
    bindDeviceEvents(device, describe, log);

    box.appendChild(deviceActions(device, log));
    describe();
    return box;
}

function bindDeviceEvents(device: Device, describe: () => void, log: Log): void {
    device.on("statusChanged", (status) => {
        log.write(`device: status ${status}`);
        describe();
    });
    device.on("connectionStatusChanged", (status) => {
        log.write(`device: conexão ${status}`);
        describe();
    });
    device.on("contactChanged", describe);
    device.on("activeCallsChanged", describe);
    device.on("qrCodeChanged", (qrCode) => log.write(qrCode ? `device: QR novo (${qrCode.length} chars)` : "device: sem QR"));
}

function deviceActions(device: Device, log: Log): HTMLElement {
    const actions = element("div", "actions");
    const run = async (name: string, command: Promise<{ error: { code: string } | null }>) => {
        const { error } = await command;
        log.write(error ? `${name} falhou — ${error.code}` : `${name} ok`);
    };
    actions.append(
        button("Acordar", () => run("wakeUp", device.wakeUp())),
        button("Reiniciar", () => run("restart", device.restart())),
    );
    return actions;
}

function dialer(wavoip: Wavoip, calls: HTMLElement, log: Log): HTMLElement {
    const box = element("div", "dialer");
    const to = field("Ligar para", "");

    const call = button("Ligar", async () => {
        const { data, error } = await wavoip.startCall({ to: to.input.value.trim() });
        if (error) {
            log.write(`saindo: ${error.code}`);
            for (const attempt of error.devices) log.write(`  ${attempt.token}: ${attempt.error.code}`);
            return;
        }
        calls.appendChild(outgoingPanel(data, log, (active) => showActive(active, calls, log)));
    });

    box.append(element("h2", undefined, "Chamar"), to.row, call);
    return box;
}

function audioPanel(wavoip: Wavoip): HTMLElement {
    const box = element("div", "audio");
    const list = element("p", "state");
    box.append(element("h2", undefined, "Áudio"), list);

    const describe = () => {
        const mics = wavoip.audio.listInputDevices().length;
        const speakers = wavoip.audio.listOutputDevices().length;
        list.textContent = `${mics} microfones · ${speakers} saídas · em uso: ${wavoip.audio.currentInput?.label || "padrão do sistema"}`;
    };
    setInterval(describe, 1_000);
    describe();
    return box;
}

function showActive(active: ActiveCall, calls: HTMLElement, log: Log): void {
    log.write(`ativa: ${active.id}`);
    calls.appendChild(activePanel(active, log));
}

boot();
