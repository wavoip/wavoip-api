import { Call } from "@/modules/device/Call";
import type { Peer } from "@/modules/device/Call";
import { describe, expect, it } from "vitest";

const peer: Peer = { phone: "5511999999999", displayName: "Test User", profilePicture: null };

function makeCall(status: ConstructorParameters<typeof Call>[5] = "CALLING") {
    return new Call("call-1", "official", "INCOMING", peer, "device-token", status);
}

describe("Call", () => {
    describe("CreateOffer", () => {
        it("sets direction=INCOMING and status=CALLING", () => {
            const call = Call.CreateOffer("id-1", "official", peer, "token-1");
            expect(call.direction).toBe("INCOMING");
            expect(call.status).toBe("CALLING");
            expect(call.id).toBe("id-1");
            expect(call.type).toBe("official");
            expect(call.deviceToken).toBe("token-1");
        });
    });

    describe("accept()", () => {
        it("transitions CALLING → ACTIVE and returns true", () => {
            const call = makeCall("CALLING");
            expect(call.accept()).toBe(true);
            expect(call.status).toBe("ACTIVE");
        });

        it("transitions RINGING → ACTIVE and returns true", () => {
            const call = makeCall("RINGING");
            expect(call.accept()).toBe(true);
            expect(call.status).toBe("ACTIVE");
        });

        it.each(["ACTIVE", "ENDED", "REJECTED", "FAILED", "NOT_ANSWERED", "DISCONNECTED"] as const)(
            "returns false and does not change status when status=%s",
            (status) => {
                const call = makeCall(status);
                expect(call.accept()).toBe(false);
                expect(call.status).toBe(status);
            },
        );
    });

    describe("reject()", () => {
        it("transitions ACTIVE → REJECTED and returns true", () => {
            const call = makeCall("ACTIVE");
            expect(call.reject()).toBe(true);
            expect(call.status).toBe("REJECTED");
        });

        it.each(["CALLING", "RINGING", "ENDED", "FAILED", "NOT_ANSWERED"] as const)(
            "returns false when status=%s",
            (status) => {
                const call = makeCall(status);
                expect(call.reject()).toBe(false);
                expect(call.status).toBe(status);
            },
        );
    });

    describe("end()", () => {
        it("transitions ACTIVE → ENDED and returns true", () => {
            const call = makeCall("ACTIVE");
            expect(call.end()).toBe(true);
            expect(call.status).toBe("ENDED");
        });

        it.each(["CALLING", "RINGING", "REJECTED", "FAILED", "NOT_ANSWERED"] as const)(
            "returns false when status=%s",
            (status) => {
                const call = makeCall(status);
                expect(call.end()).toBe(false);
                expect(call.status).toBe(status);
            },
        );
    });

    describe("timeout()", () => {
        it("transitions CALLING → NOT_ANSWERED and returns true", () => {
            const call = makeCall("CALLING");
            expect(call.timeout()).toBe(true);
            expect(call.status).toBe("NOT_ANSWERED");
        });

        it("transitions RINGING → NOT_ANSWERED and returns true", () => {
            const call = makeCall("RINGING");
            expect(call.timeout()).toBe(true);
            expect(call.status).toBe("NOT_ANSWERED");
        });

        it.each(["ACTIVE", "ENDED", "REJECTED", "FAILED"] as const)("returns false when status=%s", (status) => {
            const call = makeCall(status);
            expect(call.timeout()).toBe(false);
            expect(call.status).toBe(status);
        });
    });

    describe("fail()", () => {
        it("transitions ACTIVE → FAILED and returns true", () => {
            const call = makeCall("ACTIVE");
            expect(call.fail()).toBe(true);
            expect(call.status).toBe("FAILED");
        });

        it.each(["CALLING", "RINGING", "ENDED", "REJECTED", "NOT_ANSWERED"] as const)(
            "returns false when status=%s",
            (status) => {
                const call = makeCall(status);
                expect(call.fail()).toBe(false);
                expect(call.status).toBe(status);
            },
        );
    });
});
