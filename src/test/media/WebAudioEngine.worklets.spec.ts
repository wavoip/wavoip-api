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
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("WebAudioEngine — lazy worklet bootstrap (D2)", () => {
    it("does not call audioWorklet.addModule in the constructor", async () => {
        const { WebAudioEngine } = await import("@/platform/web/WebAudioEngine");
        new WebAudioEngine();
        expect(addModule).not.toHaveBeenCalled();
    });

    it("loads worklets on first prepare()", async () => {
        const { WebAudioEngine } = await import("@/platform/web/WebAudioEngine");
        const engine = new WebAudioEngine();

        await engine.prepare();

        // libsamplerate + mic + out
        expect(addModule).toHaveBeenCalledTimes(3);
        expect(suspend).toHaveBeenCalledTimes(1);
    });

    it("retries after a failed load, instead of caching the failure", async () => {
        const { WebAudioEngine } = await import("@/platform/web/WebAudioEngine");
        const engine = new WebAudioEngine();
        // É o que uma CSP sem `blob:` faz: o addModule recusa o módulo.
        addModule.mockRejectedValueOnce(new Error("blocked by CSP"));

        await expect(engine.prepare()).rejects.toThrow("blocked by CSP");
        await engine.prepare();

        // três da primeira tentativa, três da segunda
        expect(addModule).toHaveBeenCalledTimes(6);
    });

    it("memoises the worklet load (second prepare reuses the same promise)", async () => {
        const { WebAudioEngine } = await import("@/platform/web/WebAudioEngine");
        const engine = new WebAudioEngine();

        await engine.prepare();
        await engine.prepare();
        await engine.prepare();

        expect(addModule).toHaveBeenCalledTimes(3);
    });
});

describe("WebAudioEngine — Blob URL dos worklets", () => {
    it("não cria Blob URL nenhuma até alguém precisar dos worklets", async () => {
        const { WebAudioEngine } = await import("@/platform/web/WebAudioEngine");
        new WebAudioEngine();

        expect(createObjectURL).not.toHaveBeenCalled();
    });

    it("cria uma Blob URL por worklet e a revoga depois de carregar", async () => {
        const { WebAudioEngine } = await import("@/platform/web/WebAudioEngine");
        const engine = new WebAudioEngine();

        await engine.prepare();

        expect(createObjectURL).toHaveBeenCalledTimes(3);
        expect(revokeObjectURL).toHaveBeenCalledTimes(3);
        expect(addModule).toHaveBeenCalledWith("blob:worklet");
    });
});
