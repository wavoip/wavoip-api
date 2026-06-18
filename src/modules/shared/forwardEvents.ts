import type { EventEmitter, Unsubscribe } from "@/modules/shared/EventEmitter";

type EventMap = { [k: string]: unknown[] };

type MappedEntry<S extends EventMap, K extends keyof S, D extends EventMap> = {
    to: keyof D;
    map: (...args: S[K]) => D[keyof D];
};

export type Forwarding<S extends EventMap, D extends EventMap> = {
    [K in keyof S]?: keyof D | MappedEntry<S, K, D>;
};

/**
 * Maps a source-event name to either:
 *   - a destination-event name (1:1 forward, same payload), or
 *   - a `{ to, map }` pair where `map` transforms the payload before re-emit.
 *
 * Returns an Unsubscribe that detaches every forwarded listener at once.
 *
 * @example
 *   forwardEvents(call, emitter, {
 *     ended: "ended",
 *     peerMuted: { to: "peerMute", map: (m) => [m ? "on" : "off"] },
 *   });
 */
export function forwardEvents<S extends EventMap, D extends EventMap>(
    source: EventEmitter<S>,
    dest: EventEmitter<D>,
    mapping: Forwarding<S, D>,
): Unsubscribe {
    const unsubs: Unsubscribe[] = [];
    for (const key of Object.keys(mapping) as (keyof S)[]) {
        const entry = mapping[key];
        if (entry === undefined) continue;
        const mapped = isMappedEntry(entry) ? entry : null;
        const targetKey = (mapped ? mapped.to : entry) as keyof D;
        const listener = ((...args: S[typeof key]) => {
            const out = (mapped ? mapped.map(...args) : args) as D[keyof D];
            dest.emit(targetKey, ...out);
        }) as Parameters<EventEmitter<S>["on"]>[1];
        unsubs.push(source.on(key, listener));
    }
    return () => {
        for (const u of unsubs) u();
    };
}

function isMappedEntry(entry: unknown): entry is { to: PropertyKey; map: (...args: unknown[]) => unknown[] } {
    return typeof entry === "object" && entry !== null && "to" in entry;
}
