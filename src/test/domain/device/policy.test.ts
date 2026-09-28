import type { CallType } from "@/domain/call/types";
import type { DeviceStatus } from "@/domain/device/Device";
import { DevicePolicy } from "@/domain/device/policy";
import type { DeviceErrorCode } from "@/domain/shared/errors";
import { describe, expect, it } from "vitest";

describe("DevicePolicy.typeOfNextCall", () => {
    it.each<[DeviceStatus, DeviceErrorCode | null]>([
        ["open", null],
        ["error", "DEVICE_ERROR"],
        ["connecting", "DEVICE_NOT_LINKED"],
        ["restarting", "DEVICE_RESTARTING"],
        // Hibernando o device acorda sozinho ao receber a chamada.
        ["hibernating", null],
        ["close", null],
        // Construindo ele ainda não disse o que é.
        ["BUILDING", "DEVICE_NOT_READY"],
    ])("reads %s as %s", (status, expected) => {
        const { error } = DevicePolicy.typeOfNextCall(status, "UNOFFICIAL");

        expect(error?.code ?? null).toBe(expected);
    });

    it("hands the device call type to whoever is going to dial", () => {
        for (const type of ["OFFICIAL", "UNOFFICIAL"] satisfies CallType[]) {
            expect(DevicePolicy.typeOfNextCall("open", type).data).toBe(type);
        }
    });

    it("refuses while the server has not said what the device is", () => {
        const { data, error } = DevicePolicy.typeOfNextCall("open", null);

        expect(data).toBeNull();
        expect(error?.code).toBe("DEVICE_NOT_READY");
    });
});

describe("DevicePolicy.nextReconnectDelayMs", () => {
    it("backs off by a second per attempt", () => {
        expect(DevicePolicy.nextReconnectDelayMs(1)).toBe(1_000);
        expect(DevicePolicy.nextReconnectDelayMs(2)).toBe(2_000);
    });

    it("gives up on the third attempt", () => {
        expect(DevicePolicy.nextReconnectDelayMs(3)).toBeNull();
    });
});
