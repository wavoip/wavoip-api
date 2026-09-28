import type { MediaStreamLike, MediaTrackLike } from "@/ports/runtime/PeerConnectionPort";

/** Uma track como o react-native-webrtc entrega: `enabled`, `stop` e nada mais que importe. */
export class FakeRNTrack implements MediaTrackLike {
    enabled = true;
    stopped = false;

    constructor(readonly id: string) {}

    stop(): void {
        this.stopped = true;
    }

    getSettings(): { deviceId?: string } {
        return { deviceId: this.id };
    }

    addEventListener(): void {}
    removeEventListener(): void {}
}

export class FakeRNStream implements MediaStreamLike {
    constructor(private tracks: FakeRNTrack[]) {}

    getTracks(): MediaTrackLike[] {
        return this.tracks;
    }

    getAudioTracks(): MediaTrackLike[] {
        return this.tracks;
    }

    addTrack(track: MediaTrackLike): void {
        this.tracks = [...this.tracks, track as FakeRNTrack];
    }

    removeTrack(track: MediaTrackLike): void {
        this.tracks = this.tracks.filter((existing) => existing !== track);
    }
}

/**
 * O `mediaDevices` do react-native-webrtc, com o `enumerateDevices` devolvendo o que o nativo
 * devolveria: `unknown`, e às vezes com entradas que não servem.
 */
export class FakeRNMediaDevices {
    ondevicechange: (() => void) | null = null;
    getUserMediaCalls = 0;
    listed: unknown[] = [];
    failWith: Error | null = null;
    readonly stream = new FakeRNStream([new FakeRNTrack("mic-1")]);

    async getUserMedia(): Promise<FakeRNStream> {
        this.getUserMediaCalls += 1;
        if (this.failWith) throw this.failWith;
        return this.stream;
    }

    async enumerateDevices(): Promise<unknown> {
        return this.listed;
    }

    /** Simula o sistema avisando que a lista mudou. */
    announceChange(): void {
        this.ondevicechange?.();
    }
}
