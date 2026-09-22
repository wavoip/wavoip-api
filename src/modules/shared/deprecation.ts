const warned = new Set<string>();

export function warnDeprecated(key: string, message: string): void {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(`[wavoip] DEPRECATED ${key}: ${message}`);
}

/** Só para teste. */
export function _resetDeprecationWarnings(): void {
    warned.clear();
}
