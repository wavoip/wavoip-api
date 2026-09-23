import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Os imports `?worklet` avaliam o corpo do AudioWorkletProcessor no import, o que lança no
// happy-dom.
vi.mock("../../modules/worklets/AudioWorkletMic.ts?worklet", () => ({ default: "mic-worklet.js" }));
vi.mock("../../modules/worklets/AudioWorkletOut.ts?worklet", () => ({ default: "out-worklet.js" }));

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

const createObjectURL = vi.fn().mockReturnValue("blob:worklet");
const revokeObjectURL = vi.fn();

beforeEach(() => {
    addModule.mockClear();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    // Mexe nos dois métodos, e não no global inteiro: o `new URL(...)` do happy-dom
    // continua existindo.
    Object.assign(URL, { createObjectURL, revokeObjectURL });
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

describe("MediaManager — Blob URL dos worklets", () => {
    it("não cria Blob URL nenhuma até alguém precisar dos worklets", async () => {
        const { MediaManager } = await import("@/modules/media/MediaManager");
        new MediaManager();

        expect(createObjectURL).not.toHaveBeenCalled();
    });

    it("cria uma Blob URL por worklet e a revoga depois de carregar", async () => {
        const { MediaManager } = await import("@/modules/media/MediaManager");
        const manager = new MediaManager();

        await manager.waitReady();

        expect(createObjectURL).toHaveBeenCalledTimes(3);
        expect(revokeObjectURL).toHaveBeenCalledTimes(3);
        expect(addModule).toHaveBeenCalledWith("blob:worklet");
    });
});
