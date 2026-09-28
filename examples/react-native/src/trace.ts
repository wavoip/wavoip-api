import { useSyncExternalStore } from "react";

export type TraceLine = { readonly id: number; readonly at: number; readonly scope: string; readonly text: string };

const KEPT_LINES = 60;
const startedAt = Date.now();

let lines: TraceLine[] = [];
let nextId = 0;
const listeners = new Set<() => void>();

/**
 * O log na tela, e não no console: num aparelho de verdade ninguém tem o Metro aberto ao lado
 * quando a chamada se comporta mal.
 */
function write(scope: string, text: string): void {
    lines = [{ id: nextId++, at: Date.now() - startedAt, scope, text }, ...lines].slice(0, KEPT_LINES);
    for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** O React 19 lê o store por aqui, então a linha nova aparece sem depender de quem a escreveu. */
export function useTrace(): TraceLine[] {
    return useSyncExternalStore(subscribe, () => lines);
}

export const Trace = { write };
