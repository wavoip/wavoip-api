/** O playground não tem framework, e não deve ganhar um: só estes quatro ajudantes. */

export function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

export function button(label: string, onClick: () => void): HTMLButtonElement {
    const node = element("button", "action", label);
    node.addEventListener("click", onClick);
    return node;
}

export function field(label: string, value: string): { row: HTMLElement; input: HTMLInputElement } {
    const row = element("label", "field", label);
    const input = element("input");
    input.value = value;
    row.appendChild(input);
    return { row, input };
}

export type Log = { node: HTMLElement; write(message: string): void };

/** Uma linha por evento, com hora: é assim que se vê a ordem em que eles saem. */
export function createLog(): Log {
    const node = element("pre", "log");
    return {
        node,
        write(message: string) {
            const at = new Date().toLocaleTimeString("pt-BR");
            node.textContent = `${at}  ${message}\n${node.textContent ?? ""}`;
        },
    };
}
