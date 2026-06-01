import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../modules/worklets/AudioWorkletMic.ts?worklet", () => ({ default: "mock-mic-worklet.js" }));
vi.mock("../../modules/worklets/AudioWorkletOut.ts?worklet", () => ({ default: "mock-out-worklet.js" }));

const { MediaManager } = await import("@/modules/media/MediaManager");

// ---------------------------------------------------------------------------
// Mock browser APIs
// ---------------------------------------------------------------------------

class MockAudioContext {
    state: "suspended" | "running" | "closed" = "suspended";
    destination = {};
    audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
    suspend = vi.fn().mockImplementation(async () => {
        this.state = "suspended";
    });
    resume = vi.fn().mockImplementation(async () => {
        this.state = "running";
    });
    close = vi.fn().mockResolvedValue(undefined);
}

function makeMockTrack(id: string) {
    return {
        id,
        kind: "audio",
        enabled: true,
        stop: vi.fn(),
        getSettings: () => ({ deviceId: id }),
    } as unknown as MediaStreamTrack;
}

function makeMockStream(track: MediaStreamTrack) {
    const tracks: MediaStreamTrack[] = [track];
    return {
        id: "stream",
        getTracks: () => tracks.slice(),
        getAudioTracks: () => tracks.slice(),
        addTrack: vi.fn((t: MediaStreamTrack) => tracks.push(t)),
        removeTrack: vi.fn((t: MediaStreamTrack) => {
            const idx = tracks.indexOf(t);
            if (idx >= 0) tracks.splice(idx, 1);
        }),
    } as unknown as MediaStream;
}

const mic1 = { kind: "audioinput", deviceId: "mic-1", label: "Mic 1" } as MediaDeviceInfo;
const mic2 = { kind: "audioinput", deviceId: "mic-2", label: "Mic 2" } as MediaDeviceInfo;
const spk1 = { kind: "audiooutput", deviceId: "spk-1", label: "Speaker 1" } as MediaDeviceInfo;

function stubMediaDevices(devices: MediaDeviceInfo[], getUserMedia: ReturnType<typeof vi.fn>) {
    const stub = {
        enumerateDevices: vi.fn().mockResolvedValue(devices),
        getUserMedia,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    };
    vi.stubGlobal("navigator", { mediaDevices: stub });
    return stub;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MediaManager.setMicrophone", () => {
    beforeEach(() => {
        vi.stubGlobal("AudioContext", MockAudioContext);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("returns false for unknown deviceId", async () => {
        stubMediaDevices([mic1, spk1], vi.fn());
        const mm = new MediaManager();
        await mm.waitReady();

        const ok = await mm.setMicrophone("does-not-exist");

        expect(ok).toBe(false);
    });

    it("with no active stream: stores activeMic and emits micChanged only", async () => {
        stubMediaDevices([mic1, mic2, spk1], vi.fn());
        const mm = new MediaManager();
        await mm.waitReady();

        const micChanged = vi.fn();
        const micReplaced = vi.fn();
        mm.on("micChanged", micChanged);
        mm.on("micTrackReplaced", micReplaced);

        const ok = await mm.setMicrophone("mic-2");

        expect(ok).toBe(true);
        expect(mm.activeMic).toEqual(mic2);
        expect(micChanged).toHaveBeenCalledWith(mic2);
        expect(micReplaced).not.toHaveBeenCalled();
    });

    it("with active stream: swaps track in-place, stops old, emits micChanged + micTrackReplaced", async () => {
        const oldTrack = makeMockTrack("mic-1");
        const newTrack = makeMockTrack("mic-2");
        const stream = makeMockStream(oldTrack);
        const newStream = makeMockStream(newTrack);

        const getUserMedia = vi
            .fn()
            .mockResolvedValueOnce(stream) // initial startMedia
            .mockResolvedValueOnce(newStream); // setMicrophone hot-swap

        stubMediaDevices([mic1, mic2, spk1], getUserMedia);

        const mm = new MediaManager();
        await mm.waitReady();
        await mm.startMedia();

        const micChanged = vi.fn();
        const micReplaced = vi.fn();
        mm.on("micChanged", micChanged);
        mm.on("micTrackReplaced", micReplaced);

        const ok = await mm.setMicrophone("mic-2");

        expect(ok).toBe(true);
        expect(oldTrack.stop).toHaveBeenCalledOnce();
        expect(stream.getAudioTracks()).toEqual([newTrack]);
        expect(mm.activeMic).toEqual(mic2);
        expect(micChanged).toHaveBeenCalledWith(mic2);
        expect(micReplaced).toHaveBeenCalledWith(newTrack);
    });

    it("hot-swap preserves mute state on new track", async () => {
        const oldTrack = makeMockTrack("mic-1");
        const newTrack = makeMockTrack("mic-2");
        const stream = makeMockStream(oldTrack);
        const newStream = makeMockStream(newTrack);

        const getUserMedia = vi.fn().mockResolvedValueOnce(stream).mockResolvedValueOnce(newStream);
        stubMediaDevices([mic1, mic2, spk1], getUserMedia);

        const mm = new MediaManager();
        await mm.waitReady();
        await mm.startMedia();
        mm.setMuted(true);

        await mm.setMicrophone("mic-2");

        expect(newTrack.enabled).toBe(false);
    });
});
