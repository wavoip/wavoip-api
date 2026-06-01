import { MediaManager, type MediaManagerEvents } from "@/modules/media/MediaManager";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const inputDevice = (deviceId: string, label = deviceId): MediaDeviceInfo =>
    ({ deviceId, kind: "audioinput", label, groupId: "g1", toJSON: () => ({}) }) as MediaDeviceInfo;

const outputDevice = (deviceId: string, label = deviceId): MediaDeviceInfo =>
    ({ deviceId, kind: "audiooutput", label, groupId: "g1", toJSON: () => ({}) }) as MediaDeviceInfo;

function makeFakeTrack(id = `track-${Math.random()}`): MediaStreamTrack {
    return {
        id,
        kind: "audio",
        enabled: true,
        stop: vi.fn(),
        getSettings: () => ({ deviceId: id }),
    } as unknown as MediaStreamTrack;
}

function makeFakeStream(track: MediaStreamTrack): MediaStream {
    const tracks: MediaStreamTrack[] = [track];
    return {
        getTracks: () => tracks,
        getAudioTracks: () => tracks,
        addTrack: vi.fn((t: MediaStreamTrack) => tracks.push(t)),
        removeTrack: vi.fn((t: MediaStreamTrack) => {
            const idx = tracks.indexOf(t);
            if (idx >= 0) tracks.splice(idx, 1);
        }),
    } as unknown as MediaStream;
}

describe("MediaManager.setMicrophone", () => {
    let originalAudioContext: typeof globalThis.AudioContext;

    beforeEach(() => {
        originalAudioContext = globalThis.AudioContext;

        class FakeAudioContext {
            state = "suspended";
            audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
            suspend = vi.fn().mockResolvedValue(undefined);
            resume = vi.fn().mockResolvedValue(undefined);
            close = vi.fn().mockResolvedValue(undefined);
        }
        // biome-ignore lint/suspicious/noExplicitAny: minimal stub
        globalThis.AudioContext = FakeAudioContext as any;

        vi.stubGlobal("navigator", {
            mediaDevices: {
                enumerateDevices: vi
                    .fn()
                    .mockResolvedValue([inputDevice("mic-1"), inputDevice("mic-2"), outputDevice("spk-1")]),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                getUserMedia: vi.fn(),
            },
        });
    });

    afterEach(() => {
        globalThis.AudioContext = originalAudioContext;
        vi.unstubAllGlobals();
    });

    it("returns false when deviceId is unknown", async () => {
        const mm = new MediaManager();
        await mm.waitReady();

        const ok = await mm.setMicrophone("mic-ghost");

        expect(ok).toBe(false);
    });

    it("with no live stream: updates activeMic and emits micChanged(device, null)", async () => {
        const mm = new MediaManager();
        await mm.waitReady();
        // Force enumerate so devices populate
        await new Promise((r) => setTimeout(r, 0));

        const cb = vi.fn<(...args: MediaManagerEvents["micChanged"]) => void>();
        mm.on("micChanged", cb);

        const ok = await mm.setMicrophone("mic-1");

        expect(ok).toBe(true);
        expect(mm.activeMic?.deviceId).toBe("mic-1");
        expect(cb).toHaveBeenCalledWith(expect.objectContaining({ deviceId: "mic-1" }), null);
    });

    it("with live stream: emits micChanged(device, newTrack) and swaps the track on the stream", async () => {
        const mm = new MediaManager();
        await mm.waitReady();
        await new Promise((r) => setTimeout(r, 0));

        const oldTrack = makeFakeTrack("old");
        const newTrack = makeFakeTrack("new");
        const stream = makeFakeStream(oldTrack);
        (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
            makeFakeStream(newTrack),
        );

        // Simulate stream already acquired (skip startMedia's full init path)
        // biome-ignore lint/suspicious/noExplicitAny: test seam
        (mm as any).stream = stream;
        // biome-ignore lint/suspicious/noExplicitAny: test seam
        (mm as any).permissionGranted = true;

        const cb = vi.fn<(...args: MediaManagerEvents["micChanged"]) => void>();
        mm.on("micChanged", cb);

        const ok = await mm.setMicrophone("mic-2");

        expect(ok).toBe(true);
        expect(stream.removeTrack).toHaveBeenCalledWith(oldTrack);
        expect(oldTrack.stop).toHaveBeenCalled();
        expect(stream.addTrack).toHaveBeenCalledWith(newTrack);
        expect(cb).toHaveBeenCalledWith(expect.objectContaining({ deviceId: "mic-2" }), newTrack);
    });
});
