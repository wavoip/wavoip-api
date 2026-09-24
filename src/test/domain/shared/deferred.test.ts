import { Deferred } from "@/domain/shared/deferred";
import { describe, expect, it } from "vitest";

describe("Deferred.of", () => {
    it("resolves from outside the promise", async () => {
        const deferred = Deferred.of<string>();

        deferred.resolve("pronto");

        await expect(deferred.promise).resolves.toBe("pronto");
    });

    it("rejects from outside the promise", async () => {
        const deferred = Deferred.of<string>();

        deferred.reject(new Error("não deu"));

        await expect(deferred.promise).rejects.toThrow("não deu");
    });

    it("hands the resolvers back already assigned, and not on a later tick", () => {
        const deferred = Deferred.of<void>();

        expect(typeof deferred.resolve).toBe("function");
        expect(typeof deferred.reject).toBe("function");
    });
});
