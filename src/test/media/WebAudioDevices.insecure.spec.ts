import { WebAudioDevices } from "@/platform/web/WebAudioDevices";
import { WebAudioEngine } from "@/platform/web/WebAudioEngine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../platform/web/worklets/AudioWorkletMic.ts?worklet", () => ({ default: "mic-worklet.js" }));
vi.mock("../../platform/web/worklets/AudioWorkletOut.ts?worklet", () => ({ default: "out-worklet.js" }));

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

describe("WebAudioDevices on a platform without mediaDevices", () => {
    it("still constructs, so the failure surfaces where it can be explained", () => {
        expect(() => new WebAudioDevices(new WebAudioEngine())).not.toThrow();
    });

    it("lists no devices instead of rejecting", async () => {
        const media = new WebAudioDevices(new WebAudioEngine());

        await Promise.resolve();

        expect(media.listInputDevices()).toEqual([]);
        expect(media.currentInput).toBeNull();
    });

    it("says what is missing when the microphone is asked for", async () => {
        const media = new WebAudioDevices(new WebAudioEngine());

        await expect(media.open()).rejects.toThrow(/navigator\.mediaDevices is undefined/);
    });
});
