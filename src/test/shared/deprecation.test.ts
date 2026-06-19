import { _resetDeprecationWarnings, warnDeprecated } from "@/modules/shared/deprecation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("warnDeprecated", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        _resetDeprecationWarnings();
        warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    it("emits a console.warn including the key and message", () => {
        warnDeprecated("Foo.bar", "use baz instead.");

        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0][0]).toContain("Foo.bar");
        expect(warnSpy.mock.calls[0][0]).toContain("use baz instead.");
    });

    it("only warns once per key", () => {
        warnDeprecated("Foo.bar", "use baz.");
        warnDeprecated("Foo.bar", "use baz.");
        warnDeprecated("Foo.bar", "use baz.");

        expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it("warns once per distinct key", () => {
        warnDeprecated("Foo.bar", "use baz.");
        warnDeprecated("Foo.qux", "use baz.");

        expect(warnSpy).toHaveBeenCalledTimes(2);
    });

    it("_resetDeprecationWarnings clears the once-emitted set", () => {
        warnDeprecated("Foo.bar", "use baz.");
        expect(warnSpy).toHaveBeenCalledTimes(1);

        _resetDeprecationWarnings();
        warnDeprecated("Foo.bar", "use baz.");

        expect(warnSpy).toHaveBeenCalledTimes(2);
    });
});
