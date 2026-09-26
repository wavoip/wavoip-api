import { Status } from "@/domain/call/status";
import { describe, expect, it } from "vitest";

describe("Status.narrow", () => {
    it.each(["CANCELLED", "ENDED", "DISCONNECTED"])("keeps the known status %s", (status) => {
        expect(Status.narrow(status)).toBe(status);
    });

    it.each([undefined, "SOMETHING_NEW"])("narrows %s to ENDED", (status) => {
        expect(Status.narrow(status)).toBe("ENDED");
    });
});

describe("Status.transition", () => {
    it.each([
        ["CALLING", "accept", "ACTIVE"],
        ["RINGING", "accept", "ACTIVE"],
        ["ACTIVE", "accept", null],
        ["RINGING", "cancel", "CANCELLED"],
        ["CALLING", "cancel", "CANCELLED"],
        ["ACTIVE", "cancel", null],
        ["ENDED", "cancel", null],
        ["CALLING", "reject", "REJECTED"],
        ["RINGING", "reject", "REJECTED"],
        ["ACTIVE", "reject", null],
        ["ACTIVE", "end", "ENDED"],
        ["RINGING", "timeout", "NOT_ANSWERED"],
    ] as const)("%s + %s → %s", (from, name, to) => {
        expect(Status.transition(from, name)).toBe(to);
    });
});
