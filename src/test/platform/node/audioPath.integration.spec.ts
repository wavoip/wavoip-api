// @vitest-environment node
import { FRAME_SAMPLES, SAMPLE_RATE } from "@/platform/node/audioIo";
import { nodeRuntime } from "@/platform/node/nodeRuntime";
import { RTCPeerConnection } from "@/platform/node/wrtc";
import { afterEach, describe, expect, it } from "vitest";
import { RecordingSink } from "@/test/fakes/RecordingSink";
import { ToneSource } from "@/test/fakes/ToneSource";

/**
 * O caminho de áudio do Node inteiro, sem navegador nenhum: o PCM que o integrador empurra
 * sai pela track do wrtc, atravessa uma conexão WebRTC de verdade e volta no sumidouro do
 * outro lado. É o que prova que o adaptador serve para um bot ou uma URA.
 */
describe("Node audio path over a real peer connection", () => {
    const open: RTCPeerConnection[] = [];
    afterEach(() => {
        for (const pc of open) pc.close();
        open.length = 0;
    });

    it("carries the PCM pushed by the integrator to the far end", async () => {
        const source = new ToneSource();
        const sink = new RecordingSink();
        const runtime = nodeRuntime({ source, sink });

        const local = new RTCPeerConnection();
        const remote = new RTCPeerConnection();
        open.push(local, remote);

        // O microfone do runtime é a fonte do integrador, embrulhada numa track.
        const stream = await runtime.microphone.open();
        for (const track of stream.getAudioTracks()) {
            local.addTrack(track as never, stream as never);
        }

        // O outro lado devolve o que recebe pelo próprio motor, que escreve no sumidouro.
        const heard = new Promise<void>((resolve) => {
            remote.ontrack = (event) => {
                runtime.engine.renderRemote(event.streams[0] as never);
                resolve();
            };
        });

        await connect(local, remote);
        await heard;
        await waitFor(() => sink.samples.length >= FRAME_SAMPLES * 5, 10_000);

        expect(local.iceConnectionState).toBe("connected");
        expect(sink.samples.length).toBeGreaterThanOrEqual(FRAME_SAMPLES * 5);
        // O tom sai com amplitude 12000; o Opus devolve por perto, mas nunca silêncio nem
        // ruído solto. Faixa larga de propósito: o que se afirma é que é o mesmo sinal.
        expect(sink.peak).toBeGreaterThan(6_000);
        expect(sink.peak).toBeLessThan(20_000);

        await runtime.microphone.close();
    }, 20_000);

    /**
     * Regressão: o `RTCAudioSink` entrega na taxa do decodificador — 48 kHz —, e a
     * biblioteca presumia 16 kHz. O sumidouro do integrador recebia o triplo das amostras, e
     * a gravação saía com o triplo da duração da chamada, grave e arrastada.
     */
    it("hands the sink one second of audio for each second of call", async () => {
        const source = new ToneSource();
        const sink = new RecordingSink();
        const runtime = nodeRuntime({ source, sink });

        const local = new RTCPeerConnection();
        const remote = new RTCPeerConnection();
        open.push(local, remote);

        const stream = await runtime.microphone.open();
        for (const track of stream.getAudioTracks()) local.addTrack(track as never, stream as never);

        const heard = new Promise<void>((resolve) => {
            remote.ontrack = (event) => {
                runtime.engine.renderRemote(event.streams[0] as never);
                resolve();
            };
        });

        await connect(local, remote);
        await heard;

        const started = Date.now();
        await waitFor(() => sink.samples.length > SAMPLE_RATE, 10_000);
        const elapsed = (Date.now() - started) / 1000;
        const recorded = sink.samples.length / SAMPLE_RATE;

        // Uma folga larga para o agendador, mas longe do triplo que o defeito produzia.
        expect(recorded).toBeLessThan(elapsed * 1.5);

        await runtime.microphone.close();
    }, 20_000);

    it("rings the frames at the rate the library declares", async () => {
        const source = new ToneSource();
        const sink = new RecordingSink();
        const runtime = nodeRuntime({ source, sink });

        const stream = await runtime.microphone.open();
        expect(stream.getAudioTracks()).toHaveLength(1);
        expect(SAMPLE_RATE).toBe(16_000);
        expect(FRAME_SAMPLES).toBe(SAMPLE_RATE / 100);

        await runtime.microphone.close();
    });
});

async function connect(local: RTCPeerConnection, remote: RTCPeerConnection): Promise<void> {
    local.onicecandidate = (e) => e.candidate && remote.addIceCandidate(e.candidate);
    remote.onicecandidate = (e) => e.candidate && local.addIceCandidate(e.candidate);

    const offer = await local.createOffer();
    await local.setLocalDescription(offer);
    await remote.setRemoteDescription(offer);

    const answer = await remote.createAnswer();
    await remote.setLocalDescription(answer);
    await local.setRemoteDescription(answer);
}

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
        if (Date.now() > deadline) throw new Error(`condição não bateu em ${timeoutMs}ms`);
        await new Promise((r) => setTimeout(r, 50));
    }
}
