import { outgoingPanel } from "@/dev/callPanel";
import { button, element, field, type Log } from "@/dev/ui";
import type { ActiveCall, OutgoingCall, StartCallFailure, Wavoip } from "@/index";

type OnCall = (call: OutgoingCall) => void;

/** Ligar pelos dois caminhos: o direto e o que conta cada device que tentou. */
export function dialer(
    wavoip: Wavoip,
    calls: HTMLElement,
    log: Log,
    onActive: (call: ActiveCall) => void,
): HTMLElement {
    const box = element("div", "dialer");
    const to = field("Ligar para", "");

    const show: OnCall = (call) => calls.appendChild(outgoingPanel(call, log, onActive));
    const actions = element("div", "actions");
    actions.append(
        button("Ligar", () => void direct(wavoip, to.input.value.trim(), log, show)),
        button("Ligar com iterador", () => void iterated(wavoip, to.input.value.trim(), log, show)),
    );

    box.append(element("h2", undefined, "Chamar"), to.row, actions);
    return box;
}

async function direct(wavoip: Wavoip, to: string, log: Log, show: OnCall): Promise<void> {
    const { data, error } = await wavoip.startCall({ to });
    if (error) return reportFailure(error, log);
    show(data);
}

/**
 * O `for await` não serve aqui: ele descarta o valor de retorno do gerador, que é
 * justamente o resultado da chamada.
 */
async function iterated(wavoip: Wavoip, to: string, log: Log, show: OnCall): Promise<void> {
    const attempts = wavoip.startCallIterator({ to });

    let step = await attempts.next();
    while (!step.done) {
        log.write(`tentou ${step.value.token}: ${step.value.error.code}`);
        step = await attempts.next();
    }

    const { data, error } = step.value;
    if (error) return reportFailure(error, log);
    show(data);
}

function reportFailure(error: StartCallFailure, log: Log): void {
    log.write(`saindo: ${error.code}`);
    for (const attempt of error.devices) log.write(`  ${attempt.token}: ${attempt.error.code}`);
}
