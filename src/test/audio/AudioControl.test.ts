import type { AudioControl } from "@/domain/audio/control";
import { WebAudioDevices } from "@/platform/web/WebAudioDevices";
import { WebAudioEngine } from "@/platform/web/WebAudioEngine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../modules/worklets/AudioWorkletMic.ts?worklet", () => ({ default: "mic-worklet.js" }));
vi.mock("../../modules/worklets/AudioWorkletOut.ts?worklet", () => ({ default: "out-worklet.js" }));

/** O que o navegador lista, com os campos que só ele tem. */
const browserDevices = [
    { deviceId: "mic-1", kind: "audioinput", label: "Headset", groupId: "g1" },
    { deviceId: "mic-2", kind: "audioinput", label: "Webcam", groupId: "g2" },
    { deviceId: "speaker-1", kind: "audiooutput", label: "Alto-falante", groupId: "g1" },
    { deviceId: "cam-1", kind: "videoinput", label: "Câmera", groupId: "g2" },
] as MediaDeviceInfo[];

async function makeControl() {
    const media = new WebAudioDevices(new WebAudioEngine());
    // O construtor enumera sem esperar: aguarda a lista chegar, em vez de contar microtasks.
    await vi.waitFor(() => expect(media.listInputDevices().length).toBeGreaterThan(0));
    return { media, control: media as AudioControl };
}

beforeEach(() => {
    vi.stubGlobal(
        "AudioContext",
        class {
            audioWorklet = { addModule: vi.fn() };
            destination = {};
        },
    );
    Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
            enumerateDevices: vi.fn().mockResolvedValue(browserDevices),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            getUserMedia: vi.fn(),
        },
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("AudioControl", () => {
    it("lists microphones in the library's own shape, leaving the camera out", async () => {
        const { control } = await makeControl();

        expect(control.listInputDevices()).toEqual([
            { id: "mic-1", label: "Headset", kind: "input" },
            { id: "mic-2", label: "Webcam", kind: "input" },
        ]);
    });

    it("lists speakers apart from microphones", async () => {
        const { control } = await makeControl();

        expect(control.listOutputDevices()).toEqual([{ id: "speaker-1", label: "Alto-falante", kind: "output" }]);
    });

    it("has no current device before a call opens one", async () => {
        const { control } = await makeControl();

        expect(control.currentInput).toBeNull();
        expect(control.currentOutput).toBeNull();
    });

    it("reads the device in use as it changes, and not as it was on construction", async () => {
        const { media, control } = await makeControl();

        media.activeMic = browserDevices[1];

        expect(control.currentInput).toEqual({ id: "mic-2", label: "Webcam", kind: "input" });
    });
});
