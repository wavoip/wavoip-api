import type { MediaManager } from "@/modules/media/MediaManager";

/** Só o mute, que é o que os proxies de chamada tocam no MediaManager. */
export class FakeMediaManager {
    muted = false;

    setMuted(muted: boolean): void {
        this.muted = muted;
    }

    asMediaManager(): MediaManager {
        return this as unknown as MediaManager;
    }
}
