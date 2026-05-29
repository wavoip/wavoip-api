import { Wavoip } from "@/Wavoip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mediaManagerInstances: Array<{ iceConfig?: unknown }> = [];

vi.mock("@/modules/media/MediaManager", () => {
    return {
        MediaManager: class {
            iceConfig: unknown;
            devices: never[] = [];
            activeMic = undefined;
            activeSpeaker = undefined;
            constructor(config?: { iceConfig?: unknown }) {
                this.iceConfig = config?.iceConfig;
                mediaManagerInstances.push(this);
            }
            on() {
                return () => {};
            }
        },
    };
});

vi.mock("@/modules/device/DeviceConnection", () => {
    return {
        DeviceConnection: class {
            token = "fake";
            on() {
                return () => {};
            }
            constructor(_mm: unknown, token: string) {
                this.token = token;
            }
        },
    };
});

describe("Wavoip iceConfig", () => {
    beforeEach(() => {
        mediaManagerInstances.length = 0;
    });

    afterEach(() => {
        mediaManagerInstances.length = 0;
    });

    it("passes iceConfig through to MediaManager when provided", () => {
        const iceConfig = {
            gatheringTimeoutMs: 1500,
            iceServers: [{ urls: "stun:custom.example:3478" }],
        };
        new Wavoip({ tokens: [], iceConfig });

        expect(mediaManagerInstances).toHaveLength(1);
        expect(mediaManagerInstances[0].iceConfig).toEqual(iceConfig);
    });

    it("does not require iceConfig", () => {
        expect(() => new Wavoip({ tokens: [] })).not.toThrow();
        expect(mediaManagerInstances[0].iceConfig).toBeUndefined();
    });
});
