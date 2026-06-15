import { Wavoip } from "@/Wavoip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deviceConnectionInstances: Array<{ token: string; iceConfig?: unknown; platform?: string }> = [];

vi.mock("@/modules/media/MediaManager", () => {
    return {
        MediaManager: class {
            devices: never[] = [];
            activeMic = undefined;
            activeSpeaker = undefined;
            on() {
                return () => {};
            }
        },
    };
});

vi.mock("@/modules/device/DeviceConnection", () => {
    return {
        DeviceConnection: class {
            token: string;
            iceConfig: unknown;
            platform: string | undefined;
            constructor(_mm: unknown, token: string, platform?: string, iceConfig?: unknown) {
                this.token = token;
                this.platform = platform;
                this.iceConfig = iceConfig;
                deviceConnectionInstances.push(this);
            }
            on() {
                return () => {};
            }
        },
    };
});

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
        new Wavoip({ tokens: ["a", "b"], iceConfig });

        expect(deviceConnectionInstances).toHaveLength(2);
        expect(deviceConnectionInstances[0].iceConfig).toEqual(iceConfig);
        expect(deviceConnectionInstances[1].iceConfig).toEqual(iceConfig);
    });

    it("passes iceConfig through to DeviceConnection added via addDevices", () => {
        const iceConfig = { gatheringTimeoutMs: 2000 };
        const wavoip = new Wavoip({ tokens: [], iceConfig });
        wavoip.addDevices(["c"]);

        expect(deviceConnectionInstances).toHaveLength(1);
        expect(deviceConnectionInstances[0].iceConfig).toEqual(iceConfig);
    });

    it("does not require iceConfig", () => {
        expect(() => new Wavoip({ tokens: ["a"] })).not.toThrow();
        expect(deviceConnectionInstances[0].iceConfig).toBeUndefined();
    });

    it("preserves platform alongside iceConfig", () => {
        new Wavoip({ tokens: ["a"], platform: "web", iceConfig: { gatheringTimeoutMs: 1000 } });

        expect(deviceConnectionInstances[0].platform).toBe("web");
        expect(deviceConnectionInstances[0].iceConfig).toEqual({ gatheringTimeoutMs: 1000 });
    });
});
