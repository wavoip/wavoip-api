import type { WebAudioDevices } from "@/platform/web/WebAudioDevices";

/** Só o mute, que é o que os proxies de chamada tocam no WebAudioDevices. */
export class FakeAudioDevices {
    muted = false;

    setMuted(muted: boolean): void {
        this.muted = muted;
    }

    asAudioDevices(): WebAudioDevices {
        return this as unknown as WebAudioDevices;
    }
}
