// @vitest-environment node
import { FRAME_SAMPLES } from "@/platform/node/audioIo";
import { nodeMediaSocket } from "@/platform/node/nodeMediaSocket";
import { nodeRuntime } from "@/platform/node/nodeRuntime";
import { RecordingSink } from "@/test/fakes/RecordingSink";
import { ToneSource } from "@/test/fakes/ToneSource";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket as WsSocket } from "ws";

/**
 * O caminho da chamada não oficial em Node: o PCM do integrador sai pelo socket binário e o
 * que volta dele chega ao sumidouro. Roda contra um servidor `ws` de verdade — é a primeira
 * cobertura que este caminho tem.
 */
describe("Node relay path over a real binary socket", () => {
    let server: WebSocketServer;
    let url: string;
    const clients: WsSocket[] = [];

    beforeEach(async () => {
        server = new WebSocketServer({ port: 0 });
        await new Promise((ready) => server.once("listening", ready));
        const address = server.address();
        if (address === null || typeof address === "string") {
            throw new Error(`o servidor de teste não abriu numa porta: ${JSON.stringify(address)}`);
        }
        url = `ws://127.0.0.1:${address.port}`;
        server.on("connection", (socket) => clients.push(socket));
    });

    afterEach(async () => {
        clients.length = 0;
        await new Promise((closed) => server.close(closed));
    });

    it("sends the integrator's PCM as binary and plays back what returns", async () => {
        const source = new ToneSource();
        const sink = new RecordingSink();
        const runtime = nodeRuntime({ source, sink });

        // O servidor devolve cada frame que recebe, como o relay faz com a outra ponta.
        server.on("connection", (socket) => socket.on("message", (frame) => socket.send(frame)));

        const socket = nodeMediaSocket(url);
        await new Promise<void>((open) => socket.addEventListener("open", () => open()));

        const playback = runtime.engine.playPcm();
        socket.addEventListener("message", (event) => playback.write(event.data as ArrayBuffer));

        const capture = runtime.engine.capturePcm(null as never, (pcm) => socket.send(pcm));
        await waitFor(() => sink.samples.length >= FRAME_SAMPLES * 5, 5_000);

        capture.stop();
        playback.stop();
        socket.close();

        expect(sink.samples.length).toBeGreaterThanOrEqual(FRAME_SAMPLES * 5);
        // Sem codec no meio: o relay carrega o PCM cru, então volta idêntico.
        expect(sink.peak).toBeLessThanOrEqual(12_000);
        expect(sink.peak).toBeGreaterThan(6_000);
    }, 15_000);
});

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
        if (Date.now() > deadline) throw new Error(`condição não bateu em ${timeoutMs}ms`);
        await new Promise((r) => setTimeout(r, 25));
    }
}
