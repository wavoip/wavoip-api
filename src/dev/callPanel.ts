import type { ActiveCall, IncomingCall, OutgoingCall } from "@/index";
import { debugPanel } from "@/dev/debugPanel";
import { button, element, type Log } from "@/dev/ui";

/** Mostra o que a chamada ativa está fazendo, e deixa mexer nela. */
export function activePanel(call: ActiveCall, log: Log): HTMLElement {
    const panel = element("section", "panel");
    panel.appendChild(element("h2", undefined, `Em chamada com ${call.peer.phone}`));

    const state = element("p", "state");
    const meters = element("p", "meters");
    panel.append(state, meters, activeActions(call, log), debugPanel(call, log));

    const frame = () => {
        state.textContent = `status ${call.status} · conexão ${call.connection} · peer ${call.peer.muted ? "mudo" : "falando"}`;
        meters.textContent = `entrada ${bar(call.audio.in.level())}  saída ${bar(call.audio.out.level())}`;
        if (panel.isConnected) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    bindActiveEvents(call, panel, log);
    return panel;
}

function activeActions(call: ActiveCall, log: Log): HTMLElement {
    const actions = element("div", "actions");
    actions.append(
        button("Mutar", () => report(call.mute(), "mute", log)),
        button("Desmutar", () => report(call.unmute(), "unmute", log)),
        button("Desligar", () => report(call.end(), "end", log)),
        button("Stats", async () => log.write(JSON.stringify(await call.getStats(), null, 2))),
    );
    return actions;
}

function bindActiveEvents(call: ActiveCall, panel: HTMLElement, log: Log): void {
    call.on("ended", () => {
        log.write("ativa: o outro lado desligou");
        panel.remove();
    });
    call.on("failed", (error) => {
        log.write(`ativa: falhou — ${error.code}`);
        panel.remove();
    });
    call.on("peerMuteChanged", (muted) => log.write(`ativa: peer ${muted ? "mutou" : "desmutou"}`));
    call.on("connectionChanged", (connection) => log.write(`ativa: conexão ${connection}`));
    call.on("connectivityIssue", (issue) => log.write(`ativa: conectividade — ${issue}`));
}

/** A chamada que sai, até alguém atender. */
export function outgoingPanel(call: OutgoingCall, log: Log, onActive: (active: ActiveCall) => void): HTMLElement {
    const panel = element("section", "panel");
    panel.appendChild(element("h2", undefined, `Chamando ${call.peer.phone}`));

    const state = element("p", "state", `status ${call.status}`);
    const actions = element("div", "actions");
    actions.append(
        button("Cancelar", () => report(call.cancel(), "cancel", log)),
        button("Mutar", () => report(call.mute(), "mute", log)),
    );
    panel.append(state, actions);

    const close = (reason: string) => {
        log.write(`saindo: ${reason}`);
        panel.remove();
    };
    call.on("accepted", (active) => {
        close("atenderam");
        onActive(active);
    });
    call.on("rejected", () => close("recusaram"));
    call.on("unanswered", () => close("ninguém atendeu"));
    call.on("failed", (error) => close(`falhou — ${error.code}`));
    call.on("ended", () => close("o servidor encerrou a oferta"));
    return panel;
}

/** A oferta que chega, com os quatro desfechos que ela pode ter. */
export function incomingPanel(offer: IncomingCall, log: Log, onActive: (active: ActiveCall) => void): HTMLElement {
    const panel = element("section", "panel incoming");
    panel.appendChild(element("h2", undefined, `${offer.peer.displayName ?? offer.peer.phone} está ligando`));

    const accept = button("Atender", async () => {
        const { data, error } = await offer.accept();
        if (error) return log.write(`recebida: aceitar falhou — ${error.code}`);
        panel.remove();
        onActive(data);
    });
    const actions = element("div", "actions");
    actions.append(
        accept,
        button("Recusar", () => report(offer.reject(), "reject", log)),
    );
    panel.appendChild(actions);

    const close = (reason: string) => {
        log.write(`recebida: ${reason}`);
        panel.remove();
    };
    offer.on("cancelled", () => close("quem ligou desistiu"));
    offer.on("acceptedElsewhere", () => close("atenderam em outro lugar"));
    offer.on("rejectedElsewhere", () => close("recusaram em outro lugar"));
    offer.on("ended", () => close("a oferta acabou"));
    return panel;
}

async function report(command: Promise<{ error: { code: string } | null }>, name: string, log: Log): Promise<void> {
    const { error } = await command;
    log.write(error ? `${name} falhou — ${error.code}` : `${name} ok`);
}

function bar(level: number): string {
    const filled = Math.round(level * 20);
    return `${"█".repeat(filled).padEnd(20, "·")} ${level.toFixed(2)}`;
}
