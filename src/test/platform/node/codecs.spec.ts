// @vitest-environment node
import { nodePeerConnection } from "@/platform/node/nodePeerConnection";
import type { PeerConnectionLike } from "@/ports/runtime/PeerConnectionPort";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Contra o wrtc de verdade, porque é dele que vem o defeito: o libwebrtc M106 que ele
 * empacota anuncia ISAC, ILBC e CN em taxas que navegador nenhum anuncia mais.
 */
describe("the offer Node sends", () => {
    const open: PeerConnectionLike[] = [];
    afterEach(() => {
        for (const pc of open) pc.close();
        open.length = 0;
    });

    function peer(): PeerConnectionLike {
        const pc = nodePeerConnection({ iceServers: [] });
        open.push(pc);
        return pc;
    }

    it("announces the codecs a current browser announces, and no others", async () => {
        const pc = peer();

        await pc.setLocalDescription(await pc.createOffer());

        expect(codecsOf(pc)).toEqual([
            "opus/48000/2",
            "red/48000/2",
            "G722/8000",
            "PCMU/8000",
            "PCMA/8000",
            "CN/8000",
            "telephone-event/48000",
            "telephone-event/8000",
        ]);
    });

    it("keeps a single audio m-line when the call adds its track", async () => {
        const pc = peer();
        const { MediaStream, nonstandard } = await import("@/platform/node/wrtc");
        const stream = new MediaStream();
        const track = new nonstandard.RTCAudioSource().createTrack();
        stream.addTrack(track);
        pc.addTrack(track as never, stream as never);

        await pc.setLocalDescription(await pc.createOffer());

        expect(mlinesOf(pc)).toHaveLength(1);
    });

    /** O outro lado responde com o que quiser dentro do que oferecemos: opus, na prática. */
    it("answers an offer without adding a second m-line", async () => {
        const caller = peer();
        await caller.setLocalDescription(await caller.createOffer());
        const callee = peer();

        await callee.setRemoteDescription({ type: "offer", sdp: caller.localDescription?.sdp });
        await callee.setLocalDescription(await callee.createAnswer());

        expect(mlinesOf(callee)).toHaveLength(1);
        expect(codecsOf(callee)).toContain("opus/48000/2");
    });
});

function codecsOf(pc: PeerConnectionLike): string[] {
    return (pc.localDescription?.sdp?.match(/^a=rtpmap:\d+ (\S+)/gm) ?? []).map((line) => line.split(" ")[1]);
}

function mlinesOf(pc: PeerConnectionLike): string[] {
    return pc.localDescription?.sdp?.match(/^m=audio.*/gm) ?? [];
}
