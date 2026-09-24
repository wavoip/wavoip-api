import { Wavoip } from "@/Wavoip";
import type { WavoipRuntime } from "@/ports/WavoipRuntime";
import { FakeAudioRuntime } from "@/test/fakes/FakeAudioRuntime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deviceConnectionInstances: Array<{ token: string; transportOptions?: unknown; platform?: string }> = [];

/** Sem runtime injetado o `Wavoip` montaria o do navegador, que carrega worklet. */
function runtime(): WavoipRuntime {
    return new FakeAudioRuntime() as unknown as WavoipRuntime;
}

vi.mock("@/modules/device/connectDevice", () => ({
    connectDevice: (_runtime: unknown, token: string, platform?: string, transportOptions?: unknown) => {
        const device = { token, platform, transportOptions, on: () => () => {} };
        deviceConnectionInstances.push(device);
        return device;
    },
}));

describe("Wavoip iceConfig", () => {
    beforeEach(() => {
        deviceConnectionInstances.length = 0;
    });

    afterEach(() => {
        deviceConnectionInstances.length = 0;
    });

    it("passes iceConfig through to every DeviceConnection on construction", () => {
        const iceConfig = {
            gatheringTimeoutMs: 1500,
            iceServers: [{ urls: "stun:custom.example:3478" }],
        };
        new Wavoip({ tokens: ["a", "b"], iceConfig, runtime: runtime() });

        expect(deviceConnectionInstances).toHaveLength(2);
        expect(deviceConnectionInstances[0].transportOptions).toEqual({ iceConfig });
        expect(deviceConnectionInstances[1].transportOptions).toEqual({ iceConfig });
    });

    it("passes iceConfig through to DeviceConnection added via addDevices", () => {
        const iceConfig = { gatheringTimeoutMs: 2000 };
        const wavoip = new Wavoip({ tokens: [], iceConfig, runtime: runtime() });
        wavoip.addDevices(["c"]);

        expect(deviceConnectionInstances).toHaveLength(1);
        expect(deviceConnectionInstances[0].transportOptions).toEqual({ iceConfig });
    });

    it("does not require iceConfig", () => {
        expect(() => new Wavoip({ tokens: ["a"], runtime: runtime() })).not.toThrow();
        expect(deviceConnectionInstances[0].transportOptions).toBeUndefined();
    });

    it("preserves platform alongside iceConfig", () => {
        new Wavoip({ tokens: ["a"], platform: "web", iceConfig: { gatheringTimeoutMs: 1000 }, runtime: runtime() });

        expect(deviceConnectionInstances[0].platform).toBe("web");
        expect(deviceConnectionInstances[0].transportOptions).toEqual({ iceConfig: { gatheringTimeoutMs: 1000 } });
    });
});
