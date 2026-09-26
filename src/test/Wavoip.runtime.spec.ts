import { Wavoip } from "@/Wavoip";
import { describe, expect, it } from "vitest";

describe("new Wavoip without a runtime", () => {
    it("says what is missing and where to import it from", () => {
        // O caminho de quem chama de JavaScript puro, onde o tipo não cobra nada.
        const build = () => new Wavoip({ tokens: ["t"] } as unknown as ConstructorParameters<typeof Wavoip>[0]);

        expect(build).toThrow(TypeError);
        expect(build).toThrow(/recebeu undefined/);
        expect(build).toThrow(/@wavoip\/wavoip-api\/web/);
    });
});
