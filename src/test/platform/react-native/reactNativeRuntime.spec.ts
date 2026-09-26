import { FakeRNMediaDevices, type FakeRNTrack } from "@/test/fakes/FakeReactNativeWebrtc";
import { beforeEach, describe, expect, it, vi } from "vitest";

const devices = new FakeRNMediaDevices();

// O `react-native-webrtc` é publicado com sintaxe que só o Metro transforma, então aqui ele é
// substituído inteiro. O que se testa é a nossa lógica em volta dele.
import { FakeAudioContext, FakeAudioRecorder } from "@/test/fakes/FakeReactNativeAudioApi";

const inCall = { started: [] as unknown[], stops: 0, speakerphone: [] as boolean[] };

vi.mock("react-native-audio-api", () => ({
    AudioContext: FakeAudioContext,
    AudioRecorder: FakeAudioRecorder,
}));

// O `InCallManager` mexe na sessão de áudio do sistema; aqui só se registra o que foi pedido.
vi.mock("react-native-incall-manager", () => ({
    default: {
        start: (setup: unknown) => inCall.started.push(setup),
        stop: () => {
            inCall.stops += 1;
        },
        setForceSpeakerphoneOn: (on: boolean) => inCall.speakerphone.push(on),
    },
}));

vi.mock("react-native-webrtc", () => ({
    mediaDevices: devices,
    RTCPeerConnection: class {
        constructor(readonly config: unknown) {}
    },
}));

const { reactNativeRuntime } = await import("@/platform/react-native/reactNativeRuntime");
const { RNMicrophone } = await import("@/platform/react-native/RNMicrophone");
const { RNAudioDevices } = await import("@/platform/react-native/rnAudioDevices");

beforeEach(() => {
    inCall.started.length = 0;
    inCall.stops = 0;
    inCall.speakerphone.length = 0;
    devices.getUserMediaCalls = 0;
    devices.failWith = null;
    devices.listed = [];
});

describe("reactNativeRuntime", () => {
    it("declares both call types, now that it can handle raw PCM", () => {
        const runtime = reactNativeRuntime();

        expect(runtime.createPeer).toBeTypeOf("function");
        expect(runtime.openSocket).toBeTypeOf("function");
    });

    it("passes the integrator's ICE servers to the native connection", () => {
        const runtime = reactNativeRuntime();
        const peer = runtime.createPeer?.({ iceServers: [{ urls: "stun:example:3478" }] });

        expect((peer as unknown as { config: unknown }).config).toEqual({
            iceServers: [{ urls: "stun:example:3478" }],
        });
    });

    /**
     * Sem isto o iOS fica na categoria `Ambient`, que obedece ao botão de silencioso: a
     * chamada conecta, os pacotes chegam, e ninguém ouve nada. O momento é o da track remota
     * — antes o WebRTC nativo sobrescreve, depois o áudio já saiu pela rota errada.
     */
    it("tells the system this is a call, at the moment the remote track arrives", () => {
        const engine = reactNativeRuntime().engine;

        expect(inCall.started).toEqual([]);
        const meter = engine.renderRemote({} as never);

        expect(inCall.started).toEqual([{ media: "audio" }]);
        expect(inCall.stops).toBe(0);

        meter.stop();
        expect(inCall.stops).toBe(1);
    });

    it("hands the audio session back when the engine closes", async () => {
        await reactNativeRuntime().engine.close();
        expect(inCall.stops).toBe(1);
    });

    it("does not claim the audio session just to watch the microphone", () => {
        reactNativeRuntime().engine.monitorStream({} as never);
        expect(inCall.started).toEqual([]);
    });

    it("reports no playout latency, because the platform does not tell", () => {
        expect(reactNativeRuntime().engine.outputLatency).toBeNull();
    });

    it("lets the core build a transport for either call type", async () => {
        const { Wavoip } = await import("@/Wavoip");
        const wavoip = new Wavoip({ tokens: [], runtime: reactNativeRuntime() });
        const transports = wavoip as unknown as {
            transportsFor(token: string): { forCall(type: string): unknown };
        };

        expect(transports.transportsFor("token").forCall("UNOFFICIAL")).not.toBeNull();
    });
});

describe("RNMicrophone", () => {
    it("asks the system once and shares the stream", async () => {
        const microphone = new RNMicrophone();

        const first = await microphone.open();
        const second = await microphone.open();

        expect(first).toBe(second);
        expect(devices.getUserMediaCalls).toBe(1);
    });

    it("mutes by disabling the track, and remembers it for a later stream", async () => {
        const microphone = new RNMicrophone();
        const stream = await microphone.open();

        microphone.setMuted(true);
        expect(microphone.muted).toBe(true);
        expect(stream.getAudioTracks().every((track) => !track.enabled)).toBe(true);

        microphone.setMuted(false);
        expect(stream.getAudioTracks().every((track) => track.enabled)).toBe(true);
    });

    it("stops every track on close, so the system indicator goes away", async () => {
        const microphone = new RNMicrophone();
        const stream = (await microphone.open()) as unknown as { getTracks(): FakeRNTrack[] };

        await microphone.close();

        expect(stream.getTracks().every((track) => track.stopped)).toBe(true);
    });
});

describe("RNAudioDevices", () => {
    it("keeps only the microphones the platform really reported", async () => {
        devices.listed = [
            { deviceId: "mic", kind: "audioinput", label: "Microfone" },
            { deviceId: "cam", kind: "videoinput", label: "Câmera" },
            { kind: "audioinput" }, // sem id: o nativo às vezes manda isso
            null,
        ];
        const audio = new RNAudioDevices();

        await vi.waitFor(() => expect(audio.listInputDevices()).toHaveLength(1));
        expect(audio.listInputDevices()[0]).toEqual({ id: "mic", label: "Microfone", kind: "input" });
    });

    it("survives a platform that answers with something unexpected", async () => {
        devices.listed = "não é uma lista" as unknown as unknown[];
        const audio = new RNAudioDevices();

        await vi.waitFor(() => expect(audio.listInputDevices()).toEqual([]));
    });

    it("reads the microphones again when the system says they changed", async () => {
        const audio = new RNAudioDevices();
        await vi.waitFor(() => expect(audio.listInputDevices()).toEqual([]));

        devices.listed = [{ deviceId: "fone", kind: "audioinput", label: "Fone" }];
        devices.announceChange();

        await vi.waitFor(() => expect(audio.listInputDevices()).toHaveLength(1));
    });

    /**
     * As saídas não vêm do `enumerateDevices`: ele devolve `unknown` e não separa fone de
     * alto-falante. A escolha que um app de chamada faz é viva-voz ou não, e é ela que está
     * aqui.
     */
    it("offers the two outputs a phone really has", () => {
        const audio = new RNAudioDevices();

        expect(audio.listOutputDevices().map((device) => device.id)).toEqual(["earpiece", "speaker"]);
        expect(audio.currentOutput.id).toBe("earpiece");
    });

    it("turns the speaker on and off, and remembers which is on", async () => {
        const audio = new RNAudioDevices();

        expect((await audio.selectOutput("speaker")).error).toBeNull();
        expect(inCall.speakerphone).toEqual([true]);
        expect(audio.currentOutput.id).toBe("speaker");

        expect((await audio.selectOutput("earpiece")).error).toBeNull();
        expect(inCall.speakerphone).toEqual([true, false]);
        expect(audio.currentOutput.id).toBe("earpiece");
    });

    it("refuses an output it never offered, naming it", async () => {
        const { error } = await new RNAudioDevices().selectOutput("bluetooth-headset");

        expect(error?.code).toBe("AUDIO_DEVICE_NOT_FOUND");
        expect(error?.details).toEqual({ id: "bluetooth-headset" });
        expect(inCall.speakerphone).toEqual([]);
    });

    /** Trocar o microfone não é possível aqui, e dizer isso é melhor que aceitar e não fazer. */
    it("says the system chooses the microphone, instead of pretending to switch", async () => {
        const { error } = await new RNAudioDevices().selectInput("mic");

        expect(error?.code).toBe("INPUT_SELECTION_UNSUPPORTED");
    });
});

/**
 * O caminho da chamada não oficial, que é o que a reamostragem em JavaScript destravou: o
 * aparelho grava na taxa dele, e o que sai daqui é sempre 16 kHz, que é o que o relay fala.
 */
describe("RNAudioEngine on the relay path", () => {
    beforeEach(() => {
        FakeAudioRecorder.instances.length = 0;
        FakeAudioContext.instances.length = 0;
    });

    it("asks the device for the format the call speaks", async () => {
        await reactNativeRuntime().engine.capturePcm(null as never, () => {});

        expect(FakeAudioRecorder.instances[0].requested).toEqual({
            sampleRate: 16_000,
            bufferLength: 320,
            channelCount: 1,
        });
        expect(FakeAudioRecorder.instances[0].started).toBe(true);
    });

    /** O ponto todo: a taxa real vem do aparelho, e a saída é 16 kHz de qualquer forma. */
    it("resamples whatever rate the device actually delivers down to 16kHz", async () => {
        const frames: Int16Array[] = [];
        const handle = await reactNativeRuntime().engine.capturePcm(null as never, (pcm) => {
            frames.push(new Int16Array(pcm));
        });

        // 48 kHz, três vezes a taxa da chamada: 1440 amostras viram cerca de 480.
        FakeAudioRecorder.instances[0].deliver(recorded(440, 1_440, 48_000), 48_000);

        const produced = frames.reduce((total, frame) => total + frame.length, 0);
        expect(produced).toBeGreaterThan(400);
        expect(produced).toBeLessThan(500);
        expect(peakOf(frames)).toBeGreaterThan(1_000);

        handle.stop();
        expect(FakeAudioRecorder.instances[0].stopped).toBe(true);
    });

    /**
     * Pedimos mono, mas o aparelho decide: se ele entregar dois canais, ficar só com o
     * primeiro jogaria fora metade do que o microfone captou.
     */
    it("mixes the channels when the device records in stereo", async () => {
        const frames: Int16Array[] = [];
        await reactNativeRuntime().engine.capturePcm(null as never, (pcm) => frames.push(new Int16Array(pcm)));
        const recorder = FakeAudioRecorder.instances[0];

        // Um canal com sinal e outro em silêncio: misturados, o resultado é a metade.
        recorder.deliverChannels([recorded(440, 1_600, 16_000), new Float32Array(1_600)], 16_000);

        const pico = peakOf(frames);
        expect(pico).toBeGreaterThan(3_000);
        expect(pico).toBeLessThan(5_000);
    });

    it("follows the device when it changes rate mid-call", async () => {
        const frames: Int16Array[] = [];
        await reactNativeRuntime().engine.capturePcm(null as never, (pcm) => frames.push(new Int16Array(pcm)));
        const recorder = FakeAudioRecorder.instances[0];

        recorder.deliver(recorded(440, 1_600, 16_000), 16_000);
        const afterSameRate = frames.reduce((total, f) => total + f.length, 0);
        recorder.deliver(recorded(440, 4_800, 48_000), 48_000);
        const afterHigherRate = frames.reduce((total, f) => total + f.length, 0) - afterSameRate;

        // 1600 a 16k passam direto; 4800 a 48k viram ~1600. Os dois chegam como 16 kHz.
        expect(afterSameRate).toBe(1_600);
        expect(afterHigherRate).toBeGreaterThan(1_500);
        expect(afterHigherRate).toBeLessThanOrEqual(1_600);
    });

    it("plays what comes back at the rate the device's graph runs", () => {
        const playback = reactNativeRuntime().engine.playPcm();

        playback.write(relayed(440, 1_600).buffer as ArrayBuffer);

        const context = FakeAudioContext.instances[0];
        expect(context.queue.started).toBe(true);
        expect(context.queue.connectedTo).toBe(context.destination);
        // 1600 amostras a 16 kHz viram cerca de 4800 no grafo de 48 kHz.
        expect(context.queue.enqueued[0].length).toBeGreaterThan(4_700);
        expect(context.queue.enqueued[0].sampleRate).toBe(48_000);
    });

    /** Atraso em voz não se recupera: com a fila cheia, descartar é melhor que enfileirar. */
    it("drops audio instead of letting the queue grow past the ceiling", () => {
        const playback = reactNativeRuntime().engine.playPcm();

        for (let i = 0; i < 100; i += 1) playback.write(new Int16Array(160).buffer as ArrayBuffer);

        expect(playback.bufferedMs()).toBeLessThanOrEqual(400);
        expect(FakeAudioContext.instances[0].queue.enqueued.length).toBeLessThan(100);
    });

    it("builds the audio graph only when an unofficial call needs it", () => {
        const runtime = reactNativeRuntime();
        expect(FakeAudioContext.instances).toHaveLength(0);

        runtime.engine.playPcm();
        expect(FakeAudioContext.instances).toHaveLength(1);
    });
});

/** O que o `AudioRecorder` entrega: Float32 entre -1 e 1, como todo grafo de áudio. */
function recorded(hz: number, samples: number, rate: number): Float32Array {
    return Float32Array.from({ length: samples }, (_, i) => 0.25 * Math.sin((2 * Math.PI * hz * i) / rate));
}

/** O que o relay entrega: Int16 a 16 kHz. */
function relayed(hz: number, samples: number): Int16Array {
    return Int16Array.from({ length: samples }, (_, i) =>
        Math.round(8_000 * Math.sin((2 * Math.PI * hz * i) / 16_000)),
    );
}

function peakOf(frames: Int16Array[]): number {
    return frames.reduce((max, frame) => frame.reduce((m, s) => Math.max(m, Math.abs(s)), max), 0);
}
