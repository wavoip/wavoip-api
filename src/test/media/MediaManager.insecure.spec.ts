import { MediaManager } from "@/modules/media/MediaManager";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../modules/worklets/AudioWorkletMic.ts?worklet", () => ({ default: "mic-worklet.js" }));
vi.mock("../../modules/worklets/AudioWorkletOut.ts?worklet", () => ({ default: "out-worklet.js" }));

/** É o que o navegador faz fora de contexto seguro: `mediaDevices` simplesmente não existe. */
beforeEach(() => {
    vi.stubGlobal(
        "AudioContext",
        class {
            state = "suspended";
            audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
            destination = {};
            suspend = vi.fn().mockResolvedValue(undefined);
            resume = vi.fn().mockResolvedValue(undefined);
        },
    );
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("MediaManager on a platform without mediaDevices", () => {
    it("still constructs, so the failure surfaces where it can be explained", () => {
        expect(() => new MediaManager()).not.toThrow();
    });

    it("lists no devices instead of rejecting", async () => {
        const media = new MediaManager();

        await Promise.resolve();

        expect(media.listInputDevices()).toEqual([]);
        expect(media.currentInput).toBeNull();
    });

    it("says what is missing when the microphone is asked for", async () => {
        const media = new MediaManager();

        await expect(media.open()).rejects.toThrow(/navigator\.mediaDevices is undefined/);
    });
});
