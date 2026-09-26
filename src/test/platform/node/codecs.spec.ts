// @vitest-environment node
import { nodePeerConnection } from "@/platform/node/nodePeerConnection";
import { MediaStream, nonstandard } from "@/platform/node/wrtc";
import type { PeerConnectionLike } from "@/ports/runtime/PeerConnectionPort";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Contra o wrtc de verdade, porque é dele que vem o defeito: o libwebrtc M106 que ele
 * empacota anuncia ISAC, ILBC e CN em taxas que navegador nenhum anuncia mais.
 */
describe("the SDP Node produces", () => {
    const open: PeerConnectionLike[] = [];
    afterEach(() => {
        for (const pc of open) pc.close();
        open.length = 0;
    });

    const BROWSER_CODECS = [
        "opus/48000/2",
        "red/48000/2",
        "G722/8000",
        "PCMU/8000",
        "PCMA/8000",
        "CN/8000",
        "telephone-event/48000",
        "telephone-event/8000",
    ];

    /** Como o núcleo monta a mídia: uma track de PCM entrando na conexão. */
    function peerWithTrack(): PeerConnectionLike {
        const pc = nodePeerConnection({ iceServers: [] });
        open.push(pc);

        const stream = new MediaStream();
        const track = new nonstandard.RTCAudioSource().createTrack();
        stream.addTrack(track);
        pc.addTrack(track as never, stream as never);
        return pc;
    }

    it("announces in the offer the codecs a current browser announces, and no others", async () => {
        const pc = peerWithTrack();

        await pc.setLocalDescription(await pc.createOffer());

        expect(codecsOf(pc)).toEqual(BROWSER_CODECS);
        expect(mlinesOf(pc)).toHaveLength(1);
    });

    it("announces the same codecs in the answer", async () => {
        const caller = peerWithTrack();
        await caller.setLocalDescription(await caller.createOffer());
        const callee = peerWithTrack();

        await callee.setRemoteDescription({ type: "offer", sdp: caller.localDescription?.sdp });
        await callee.setLocalDescription(await callee.createAnswer());

        expect(codecsOf(callee)).toEqual(BROWSER_CODECS);
        expect(mlinesOf(callee)).toHaveLength(1);
    });

    /**
     * Regressão: configurar as preferências num transceiver criado antes da oferta remota
     * deixava o libwebrtc associar a linha de mídia dela a outro transceiver, e a resposta
     * saía `recvonly` — quem atendia ouvia o contato, e o contato não ouvia nada.
     */
    it("answers sending as well as receiving", async () => {
        const caller = peerWithTrack();
        await caller.setLocalDescription(await caller.createOffer());
        const callee = peerWithTrack();

        await callee.setRemoteDescription({ type: "offer", sdp: caller.localDescription?.sdp });
        await callee.setLocalDescription(await callee.createAnswer());

        expect(directionsOf(callee)).toEqual(["a=sendrecv"]);
    });

    it("closes the negotiation the caller started", async () => {
        const caller = peerWithTrack();
        await caller.setLocalDescription(await caller.createOffer());
        const callee = peerWithTrack();
        await callee.setRemoteDescription({ type: "offer", sdp: caller.localDescription?.sdp });
        await callee.setLocalDescription(await callee.createAnswer());

        await caller.setRemoteDescription({ type: "answer", sdp: callee.localDescription?.sdp });

        expect(directionsOf(caller)).toEqual(["a=sendrecv"]);
    });
});

function codecsOf(pc: PeerConnectionLike): string[] {
    return (pc.localDescription?.sdp?.match(/^a=rtpmap:\d+ (\S+)/gm) ?? []).map((line) => line.split(" ")[1]);
}

function mlinesOf(pc: PeerConnectionLike): string[] {
    return pc.localDescription?.sdp?.match(/^m=audio.*/gm) ?? [];
}

function directionsOf(pc: PeerConnectionLike): string[] {
    return pc.localDescription?.sdp?.match(/^a=(sendrecv|sendonly|recvonly|inactive)/gm) ?? [];
}
