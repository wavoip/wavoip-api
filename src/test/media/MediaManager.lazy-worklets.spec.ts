import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Worklet `?worklet` imports evaluate the AudioWorkletProcessor module body at
// import time, which throws under happy-dom. Mock them to plain URL strings.
vi.mock("../../modules/worklets/AudioWorkletMic.ts?worklet", () => ({ default: "mic-worklet.js" }));
vi.mock("../../modules/worklets/AudioWorkletOut.ts?worklet", () => ({ default: "out-worklet.js" }));

// AudioContext + addModule are stubbed at the global level so MediaManager's
// constructor doesn't hit the real Web Audio API under happy-dom.

const addModule = vi.fn().mockResolvedValue(undefined);
const suspend = vi.fn().mockResolvedValue(undefined);
const resume = vi.fn().mockResolvedValue(undefined);
const close = vi.fn().mockResolvedValue(undefined);

class FakeAudioContext {
    state: "suspended" | "running" = "suspended";
    audioWorklet = { addModule };
    destination = {} as AudioNode;
    suspend = suspend;
    resume = resume;
    close = close;
    createMediaStreamSource = vi.fn();
    createAnalyser = vi.fn();
}

beforeEach(() => {
    addModule.mockClear();
    suspend.mockClear();
    resume.mockClear();
    close.mockClear();
    vi.stubGlobal("AudioContext", FakeAudioContext);
    Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
            enumerateDevices: vi.fn().mockResolvedValue([]),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            getUserMedia: vi.fn(),
        },
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("MediaManager — lazy worklet bootstrap (D2)", () => {
    it("does not call audioWorklet.addModule in the constructor", async () => {
        const { MediaManager } = await import("@/modules/media/MediaManager");
        new MediaManager();
        expect(addModule).not.toHaveBeenCalled();
    });

    it("loads worklets on first waitReady()", async () => {
        const { MediaManager } = await import("@/modules/media/MediaManager");
        const mm = new MediaManager();

        await mm.waitReady();

        // libsamplerate + mic + out
        expect(addModule).toHaveBeenCalledTimes(3);
        expect(suspend).toHaveBeenCalledTimes(1);
    });

    it("memoises the worklet load (second waitReady reuses the same promise)", async () => {
        const { MediaManager } = await import("@/modules/media/MediaManager");
        const mm = new MediaManager();

        await mm.waitReady();
        await mm.waitReady();
        await mm.waitReady();

        expect(addModule).toHaveBeenCalledTimes(3);
    });
});
