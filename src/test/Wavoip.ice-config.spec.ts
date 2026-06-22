import { Wavoip } from "@/Wavoip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deviceConnectionInstances: Array<{ token: string; transportOptions?: unknown; platform?: string }> = [];

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
            transportOptions: unknown;
            platform: string | undefined;
            constructor(_mm: unknown, token: string, platform?: string, transportOptions?: unknown) {
                this.token = token;
                this.platform = platform;
                this.transportOptions = transportOptions;
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
        expect(deviceConnectionInstances[0].transportOptions).toEqual({ iceConfig });
        expect(deviceConnectionInstances[1].transportOptions).toEqual({ iceConfig });
    });

    it("passes iceConfig through to DeviceConnection added via addDevices", () => {
        const iceConfig = { gatheringTimeoutMs: 2000 };
        const wavoip = new Wavoip({ tokens: [], iceConfig });
        wavoip.addDevices(["c"]);

        expect(deviceConnectionInstances).toHaveLength(1);
        expect(deviceConnectionInstances[0].transportOptions).toEqual({ iceConfig });
    });

    it("does not require iceConfig", () => {
        expect(() => new Wavoip({ tokens: ["a"] })).not.toThrow();
        expect(deviceConnectionInstances[0].transportOptions).toBeUndefined();
    });

    it("preserves platform alongside iceConfig", () => {
        new Wavoip({ tokens: ["a"], platform: "web", iceConfig: { gatheringTimeoutMs: 1000 } });

        expect(deviceConnectionInstances[0].platform).toBe("web");
        expect(deviceConnectionInstances[0].transportOptions).toEqual({ iceConfig: { gatheringTimeoutMs: 1000 } });
    });

    it("bundles statsTickMs into transportOptions alongside iceConfig", () => {
        new Wavoip({ tokens: ["a"], iceConfig: { gatheringTimeoutMs: 800 }, statsTickMs: 1000 });

        expect(deviceConnectionInstances[0].transportOptions).toEqual({
            iceConfig: { gatheringTimeoutMs: 800 },
            statsTickMs: 1000,
        });
    });
});
