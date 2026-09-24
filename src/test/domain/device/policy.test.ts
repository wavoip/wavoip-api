import { DevicePolicy } from "@/domain/device/policy";
import type { DeviceStatus } from "@/domain/device/types";
import type { DeviceErrorCode } from "@/domain/shared/errors";
import { describe, expect, it } from "vitest";

describe("DevicePolicy.canCall", () => {
    it.each<[DeviceStatus, DeviceErrorCode | null]>([
        ["open", null],
        ["error", "DEVICE_ERROR"],
        ["connecting", "DEVICE_NOT_LINKED"],
        ["restarting", "DEVICE_RESTARTING"],
        // Hibernando o device acorda sozinho ao receber a chamada.
        ["hibernating", null],
        ["close", null],
    ])("reads %s as %s", (status, expected) => {
        expect(DevicePolicy.canCall(status)).toBe(expected);
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
