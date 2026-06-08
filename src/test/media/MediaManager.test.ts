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

describe("MediaManager.permission", () => {
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
    });

    afterEach(() => {
        globalThis.AudioContext = originalAudioContext;
        vi.unstubAllGlobals();
    });

    function stubNavigator(opts: {
        initialDevices?: MediaDeviceInfo[];
        permissionState?: PermissionState;
        getUserMediaThrows?: boolean;
    }) {
        const listeners: (() => void)[] = [];
        const status = opts.permissionState
            ? {
                  state: opts.permissionState,
                  addEventListener: (_: string, cb: () => void) => {
                      listeners.push(cb);
                  },
                  removeEventListener: vi.fn(),
              }
            : null;

        vi.stubGlobal("navigator", {
            mediaDevices: {
                enumerateDevices: vi.fn().mockResolvedValue(opts.initialDevices ?? []),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                getUserMedia: opts.getUserMediaThrows
                    ? vi.fn().mockRejectedValue(new Error("NotAllowed"))
                    : vi.fn().mockResolvedValue({
                          getTracks: () => [{ stop: vi.fn() }],
                      }),
            },
            permissions: status ? { query: vi.fn().mockResolvedValue(status) } : undefined,
        });

        return { listeners, status };
    }

    it("probes permission on construct and caches the reported state", async () => {
        stubNavigator({ permissionState: "granted" });
        const mm = new MediaManager();
        await mm.waitReady();
        await new Promise((r) => setTimeout(r, 0));

        expect(mm.getPermissionState()).toBe("granted");
    });

    it("falls back to 'unknown' when navigator.permissions is missing", async () => {
        stubNavigator({});
        const mm = new MediaManager();
        await mm.waitReady();
        await new Promise((r) => setTimeout(r, 0));

        expect(mm.getPermissionState()).toBe("unknown");
    });

    it("emits permissionChanged when the browser status flips", async () => {
        const { listeners, status } = stubNavigator({ permissionState: "prompt" });
        const mm = new MediaManager();
        await mm.waitReady();
        await new Promise((r) => setTimeout(r, 0));

        const cb = vi.fn<(...args: MediaManagerEvents["permissionChanged"]) => void>();
        mm.on("permissionChanged", cb);

        if (status) status.state = "granted";
        for (const l of listeners) l();
        await new Promise((r) => setTimeout(r, 0));

        expect(cb).toHaveBeenCalledWith("granted");
        expect(mm.getPermissionState()).toBe("granted");
    });

    it("requestMicrophonePermission() resolves 'granted' on success and re-enumerates", async () => {
        stubNavigator({ initialDevices: [inputDevice("mic-1")] });
        const mm = new MediaManager();
        await mm.waitReady();
        await new Promise((r) => setTimeout(r, 0));

        const devicesCb = vi.fn<(...args: MediaManagerEvents["devicesChanged"]) => void>();
        mm.on("devicesChanged", devicesCb);
        // Permission grant uncovers a real device label — list now differs, so emit fires.
        (navigator.mediaDevices.enumerateDevices as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
            inputDevice("mic-1", "Built-in Mic"),
        ]);

        const result = await mm.requestMicrophonePermission();

        expect(result).toBe("granted");
        expect(mm.getPermissionState()).toBe("granted");
        expect(devicesCb).toHaveBeenCalled();
    });

    it("requestMicrophonePermission() resolves 'denied' when getUserMedia throws", async () => {
        stubNavigator({ getUserMediaThrows: true });
        const mm = new MediaManager();
        await mm.waitReady();
        await new Promise((r) => setTimeout(r, 0));

        const result = await mm.requestMicrophonePermission();

        expect(result).toBe("denied");
        expect(mm.getPermissionState()).toBe("denied");
    });

    it("refreshDevices() unblocks device IDs when permission is granted but enumerate returns blank entries", async () => {
        const blank = { deviceId: "", kind: "audioinput", label: "", groupId: "", toJSON: () => ({}) } as MediaDeviceInfo;
        const real = inputDevice("mic-real", "Built-in");
        stubNavigator({ permissionState: "granted" });
        const enumerateMock = navigator.mediaDevices.enumerateDevices as ReturnType<typeof vi.fn>;
        // Three blank reads (ctor's enumerate, probePermission's refresh enumerate,
        // unblockDeviceIds inner enumerate triggers the fourth) then real after getUserMedia.
        enumerateMock.mockResolvedValue([blank]);

        const mm = new MediaManager();
        await mm.waitReady();
        await new Promise((r) => setTimeout(r, 0));

        // After init, ctor probe triggered the unblock attempt. Swap the mock to
        // return real ids, then ask for a fresh snapshot.
        enumerateMock.mockResolvedValue([real]);
        const devices = await mm.refreshDevices();

        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
        expect(devices.map((d) => d.deviceId)).toEqual(["mic-real"]);
    });

    it("refreshDevices() does not call getUserMedia when device IDs are already populated", async () => {
        stubNavigator({ initialDevices: [inputDevice("mic-1")], permissionState: "granted" });

        const mm = new MediaManager();
        await mm.waitReady();
        await new Promise((r) => setTimeout(r, 0));

        (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockClear();
        await mm.refreshDevices();

        expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    });

    it("refreshDevices() does not unblock when permission is not granted", async () => {
        const blank = { deviceId: "", kind: "audioinput", label: "", groupId: "", toJSON: () => ({}) } as MediaDeviceInfo;
        stubNavigator({ initialDevices: [blank], permissionState: "prompt" });

        const mm = new MediaManager();
        await mm.waitReady();
        await new Promise((r) => setTimeout(r, 0));

        (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockClear();
        await mm.refreshDevices();

        expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    });

    it("refreshDevices() unblock attempt is one-shot to avoid loops on permanently-blank contexts", async () => {
        const blank = { deviceId: "", kind: "audioinput", label: "", groupId: "", toJSON: () => ({}) } as MediaDeviceInfo;
        stubNavigator({ initialDevices: [blank], permissionState: "granted" });
        (navigator.mediaDevices.enumerateDevices as ReturnType<typeof vi.fn>).mockResolvedValue([blank]);

        const mm = new MediaManager();
        await mm.waitReady();
        await new Promise((r) => setTimeout(r, 0));

        (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockClear();
        await mm.refreshDevices();
        await mm.refreshDevices();
        await mm.refreshDevices();

        expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    });
});
