import { EventEmitter } from "@/modules/shared/EventEmitter";
import type { AudioDevice } from "@/domain/audio/device";
import type { AudioControl } from "@/domain/audio/control";
import type { AudioEnginePort } from "@/ports/runtime/AudioEnginePort";
import type { MicrophonePort } from "@/ports/runtime/MicrophonePort";

export type MediaManagerEvents = {
    devicesChanged: [devices: MediaDeviceInfo[]];
    micChanged: [device: MediaDeviceInfo | null];
    speakerChanged: [device: MediaDeviceInfo | null];
    muteChanged: [muted: boolean];
};

/** O microfone e a lista de aparelhos do navegador. O áudio em si é do `WebAudioEngine`. */
export class MediaManager extends EventEmitter<MediaManagerEvents> implements MicrophonePort, AudioControl {
    public devices: MediaDeviceInfo[] = [];
    public activeMic?: MediaDeviceInfo;
    public activeSpeaker?: MediaDeviceInfo;
    public stream?: MediaStream;
    public muted = false;

    private attachedElements: Set<HTMLAudioElement> = new Set();
    private activeSpeakerId?: string;
    private permissionGranted = false;

    constructor(public readonly engine: AudioEnginePort) {
        super();
        // Fora de contexto seguro o navegador não expõe `mediaDevices`. Quebrar aqui derrubaria
        // o `new Wavoip()` inteiro e esconderia o motivo; a lista fica vazia e quem pedir áudio
        // recebe a falha com o código dela.
        void this.enumerateDevices();
        navigator.mediaDevices?.addEventListener("devicechange", this.handleDeviceChange);
    }

    /** O que o navegador lista, já no tipo neutro que a API pública entrega. */
    listInputDevices(): AudioDevice[] {
        return this.listDevices("audioinput");
    }

    listOutputDevices(): AudioDevice[] {
        return this.listDevices("audiooutput");
    }

    get currentInput(): AudioDevice | null {
        return this.activeMic ? toAudioDevice(this.activeMic) : null;
    }

    get currentOutput(): AudioDevice | null {
        return this.activeSpeaker ? toAudioDevice(this.activeSpeaker) : null;
    }

    private listDevices(kind: MediaDeviceKind): AudioDevice[] {
        return this.devices.filter((device) => device.kind === kind).map(toAudioDevice);
    }

    haveMedia(): boolean {
        const hasMic = this.devices.some((d) => d.kind === "audioinput");
        const hasSpeaker = this.devices.some((d) => d.kind === "audiooutput");
        return hasMic && hasSpeaker;
    }

    async open(): Promise<MediaStream> {
        if (this.stream) return this.stream;

        await this.engine.prepare();

        const mic = this.activeMic ?? this.devices.find((d) => d.kind === "audioinput");
        const pinned = this.permissionGranted ? mic?.deviceId : undefined;

        const stream = await capture(buildAudioConstraints(pinned));
        this.stream = stream;
        this.permissionGranted = true;

        await this.enumerateDevices();

        const trackSettings = stream.getAudioTracks()[0]?.getSettings();
        if (trackSettings?.deviceId) {
            this.activeMic =
                this.devices.find((d) => d.kind === "audioinput" && d.deviceId === trackSettings.deviceId) ??
                this.activeMic;
        }

        await this.engine.resume();

        return stream;
    }

    async close(): Promise<void> {
        if (this.stream) {
            for (const track of this.stream.getTracks()) {
                track.stop();
            }
            this.stream = undefined;
        }

        await this.engine.suspend();
    }

    async destroy(): Promise<void> {
        await this.close();

        navigator.mediaDevices?.removeEventListener("devicechange", this.handleDeviceChange);

        await this.engine.close();
        this.removeAllListeners();
    }

    /**
     * Com stream rodando, troca a track dentro do próprio stream em vez de criar outro,
     * para quem já está enviando não ser interrompido.
     */
    async setMicrophone(deviceId: string): Promise<boolean> {
        const device = this.devices.find((d) => d.kind === "audioinput" && d.deviceId === deviceId);

        if (!device) {
            return false;
        }

        if (!this.stream) {
            this.activeMic = device;
            this.emit("micChanged", device);
            return true;
        }

        const newStream = await capture(buildAudioConstraints(deviceId));

        const newTrack = newStream.getAudioTracks()[0];

        newTrack.enabled = !this.muted;

        const oldTrack = this.stream.getAudioTracks()[0];
        if (oldTrack) {
            this.stream.removeTrack(oldTrack);
            oldTrack.stop();
        }
        this.stream.addTrack(newTrack);

        this.activeMic = device;
        this.emit("micChanged", device);
        return true;
    }

    /**
     * setSinkId não existe em todo navegador (o Firefox não tinha em 2024); sem ele, a
     * troca de alto-falante simplesmente não acontece.
     */
    async setSpeaker(deviceId: string): Promise<void> {
        const device = this.devices.find((d) => d.kind === "audiooutput" && d.deviceId === deviceId);

        if (!device) {
            throw new Error(`Speaker device not found: ${deviceId}`);
        }

        this.activeSpeakerId = deviceId;
        this.activeSpeaker = device;

        await Promise.all([...this.attachedElements].map((el) => this.applySinkId(el, deviceId)));

        this.emit("speakerChanged", device);
    }

    async attachSpeaker(el: HTMLAudioElement): Promise<void> {
        this.attachedElements.add(el);

        if (this.activeSpeakerId) {
            await this.applySinkId(el, this.activeSpeakerId);
        }
    }

    detachSpeaker(el: HTMLAudioElement): void {
        this.attachedElements.delete(el);
    }

    /**
     * Pelo track.enabled: sem derrubar o stream e sem renegociar.
     */
    toggleMute(): void {
        if (!this.stream) return;

        this.muted = !this.muted;

        for (const track of this.stream.getAudioTracks()) {
            track.enabled = !this.muted;
        }

        this.emit("muteChanged", this.muted);
    }

    setMuted(muted: boolean): void {
        if (!this.stream || this.muted === muted) return;

        this.muted = muted;

        for (const track of this.stream.getAudioTracks()) {
            track.enabled = !this.muted;
        }

        this.emit("muteChanged", this.muted);
    }

    private async enumerateDevices(): Promise<void> {
        const all = await listPlatformDevices();
        this.devices = all.filter((d) => d.kind === "audioinput" || d.kind === "audiooutput");

        if (this.permissionGranted) {
            if (!this.activeMic) {
                this.activeMic = this.devices.find((d) => d.kind === "audioinput");
            }
            if (!this.activeSpeaker) {
                this.activeSpeaker = this.devices.find((d) => d.kind === "audiooutput");
                if (this.activeSpeaker) {
                    this.activeSpeakerId = this.activeSpeaker.deviceId;
                }
            }
        }
    }

    private handleDeviceChange = async (): Promise<void> => {
        const prevMicId = this.activeMic?.deviceId;
        const prevSpeakerId = this.activeSpeaker?.deviceId;

        await this.enumerateDevices();
        this.emit("devicesChanged", this.devices);

        if (prevMicId) {
            const still = this.devices.find((d) => d.kind === "audioinput" && d.deviceId === prevMicId);
            if (!still) {
                this.activeMic = undefined;
                this.emit("micChanged", null);
            }
        }

        if (prevSpeakerId) {
            const still = this.devices.find((d) => d.kind === "audiooutput" && d.deviceId === prevSpeakerId);
            if (!still) {
                this.activeSpeaker = undefined;
                this.activeSpeakerId = undefined;
                this.emit("speakerChanged", null);
            }
        }
    };

    private async applySinkId(el: HTMLAudioElement, deviceId: string): Promise<void> {
        if (typeof (el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId === "function") {
            try {
                await (el as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId);
            } catch (err) {
                console.warn("[MediaManager] setSinkId failed:", err);
            }
        }
    }
}

function buildAudioConstraints(deviceId?: string): MediaStreamConstraints {
    return {
        audio: {
            ...(deviceId && { deviceId: { exact: deviceId } }),
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
        },
        video: false,
    };
}

function toAudioDevice(device: MediaDeviceInfo): AudioDevice {
    return {
        id: device.deviceId,
        label: device.label,
        kind: device.kind === "audioinput" ? "input" : "output",
    };
}

/**
 * Falhar aqui é a resposta certa — o que não pode é falhar com um `TypeError` de propriedade
 * indefinida, que não diz nada a quem lê o console.
 */
function capture(constraints: MediaStreamConstraints): Promise<MediaStream> {
    if (!navigator.mediaDevices) {
        throw new Error(
            "navigator.mediaDevices is undefined: capturing audio needs a secure context (HTTPS or localhost)",
        );
    }
    return navigator.mediaDevices.getUserMedia(constraints);
}

/** Uma lista vazia diz "não sei quais são" sem derrubar quem chamou. */
async function listPlatformDevices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices) return [];
    return navigator.mediaDevices.enumerateDevices().catch(() => []);
}
