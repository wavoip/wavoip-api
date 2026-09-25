import { FakeRNMediaDevices, type FakeRNTrack } from "@/test/fakes/FakeReactNativeWebrtc";
import { beforeEach, describe, expect, it, vi } from "vitest";

const devices = new FakeRNMediaDevices();

// O `react-native-webrtc` é publicado com sintaxe que só o Metro transforma, então aqui ele é
// substituído inteiro. O que se testa é a nossa lógica em volta dele.
const inCall = { started: [] as unknown[], stops: 0, speakerphone: [] as boolean[] };

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
    /**
     * A ausência é o contrato: sem `openSocket`, o `Wavoip` recusa a chamada não oficial na
     * hora de abrir, em vez de descobrir no meio da ligação que não sabe tratar PCM.
     */
    it("declares that it cannot take an unofficial call", () => {
        const runtime = reactNativeRuntime();

        expect(runtime.createPeer).toBeTypeOf("function");
        expect(runtime.openSocket).toBeUndefined();
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

    /**
     * O outro lado da ausência: o núcleo lê o `openSocket` que falta e recusa o tipo, em vez
     * de montar um transporte que não teria como funcionar. Quem transforma isso no código
     * `CALL_TYPE_UNSUPPORTED` é o `CallSession.Start`, coberto em `CallSession.unsupported`.
     */
    it("makes the core refuse an unofficial call up front", async () => {
        const { Wavoip } = await import("@/Wavoip");
        const wavoip = new Wavoip({ tokens: [], runtime: reactNativeRuntime() });
        const transports = wavoip as unknown as {
            transportsFor(token: string): { forCall(type: string): unknown };
        };

        expect(transports.transportsFor("token").forCall("UNOFFICIAL")).toBeNull();
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
