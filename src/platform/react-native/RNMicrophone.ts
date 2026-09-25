import type { MicrophonePort } from "@/ports/runtime/MicrophonePort";
import type { MediaStreamLike, MediaTrackLike } from "@/ports/runtime/PeerConnectionPort";
import { mediaDevices } from "react-native-webrtc";

/**
 * O microfone do aparelho, pelo react-native-webrtc. É o mesmo `getUserMedia` do navegador,
 * com o nativo por baixo — por isso este adaptador é quase só um cast.
 *
 * Pedir o microfone é o que dispara a permissão do sistema. O app tem de ter declarado
 * `RECORD_AUDIO` no Android e `NSMicrophoneUsageDescription` no iOS, senão a promessa é
 * rejeitada e a chamada devolve o erro de mídia.
 */
export class RNMicrophone implements MicrophonePort {
    private stream: MediaStreamLike | null = null;
    private _muted = false;

    get muted(): boolean {
        return this._muted;
    }

    get isOpen(): boolean {
        return this.stream !== null;
    }

    async open(): Promise<MediaStreamLike> {
        if (this.stream) return this.stream;

        const stream = (await mediaDevices.getUserMedia({ audio: true })) as unknown as MediaStreamLike;
        for (const track of stream.getAudioTracks()) track.enabled = !this._muted;

        this.stream = stream;
        return stream;
    }

    async close(): Promise<void> {
        for (const track of this.stream?.getTracks() ?? []) track.stop();
        this.stream = null;
    }

    setMuted(muted: boolean): void {
        this._muted = muted;
        for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = !muted;
    }

    /** Só para quem precisa da track crua, como o medidor. */
    tracks(): MediaTrackLike[] {
        return this.stream?.getAudioTracks() ?? [];
    }
}
