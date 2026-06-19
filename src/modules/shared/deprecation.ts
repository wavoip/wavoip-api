const warned = new Set<string>();

/**
 * Emit a `console.warn` exactly once per `key` for a deprecated API surface.
 *
 * Sprint D leaves the old single-listener `.onX()` methods in place but warns
 * consumers to migrate to `.on("event", cb)`. The methods will be removed in
 * the next major. `reset()` exists for tests that need to re-trigger the warn.
 */
export function warnDeprecated(key: string, message: string): void {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(`[wavoip] DEPRECATED ${key}: ${message}`);
}

/** Clear the once-emitted set. Test-only. */
export function _resetDeprecationWarnings(): void {
    warned.clear();
}
