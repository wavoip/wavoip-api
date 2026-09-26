import { RTCPeerConnection, RTCRtpSender } from "@/platform/node/wrtc";
import type { PeerConnectionFactory, PeerConnectionLike } from "@/ports/runtime/PeerConnectionPort";

/**
 * Os codecs de áudio que um navegador atual anuncia. Os outros o `wrtc` ainda oferece, e
 * ninguém do outro lado vai escolher.
 */
const BROWSER_CODECS: Record<string, readonly number[] | "any"> = {
    "audio/opus": "any",
    "audio/red": "any",
    "audio/G722": "any",
    "audio/PCMU": "any",
    "audio/PCMA": "any",
    // O `wrtc` anuncia CN em 8, 16 e 32 kHz; o Chrome, só em 8.
    "audio/CN": [8_000],
    "audio/telephone-event": [48_000, 8_000],
};

/**
 * O `RTCPeerConnection` do wrtc tem a mesma forma da porta — é uma implementação nativa da
 * mesma especificação. O cast é pelo mapa de eventos, igual ao do navegador.
 */
export const nodePeerConnection: PeerConnectionFactory = (config) => {
    const pc = new RTCPeerConnection({ iceServers: config.iceServers as RTCIceServer[] });
    preferBrowserCodecs(pc);
    return pc as unknown as PeerConnectionLike;
};

/**
 * O `@roamhq/wrtc` empacota libwebrtc M106 (Chrome 106, de 2022) e anuncia codecs que
 * navegador nenhum anuncia mais: ISAC em 16 e 32 kHz, ILBC, CN em 16 e 32 kHz,
 * telephone-event em 16 e 32 kHz. São 15 payloads na oferta, contra 8 do Chrome de hoje.
 *
 * A oferta sai com os 8, e não com os 15, porque quem recebe a nossa é o WhatsApp, e o SDP
 * que se sabe que ele aceita é o do navegador. Oferecer codec que ninguém escolhe só dá ao
 * outro lado mais chance de tropeçar na tradução.
 *
 * O transceiver é criado aqui, antes da track: o `addTrack` do núcleo reaproveita um
 * transceiver de áudio livre em vez de criar outro, então a preferência vale para a chamada
 * inteira, nas duas direções.
 */
function preferBrowserCodecs(pc: RTCPeerConnection): void {
    const codecs = RTCRtpSender.getCapabilities("audio")?.codecs.filter(isBrowserCodec);
    if (!codecs?.length) return;
    pc.addTransceiver("audio", { direction: "sendrecv" }).setCodecPreferences(codecs);
}

function isBrowserCodec(codec: { mimeType: string; clockRate: number }): boolean {
    const rates = BROWSER_CODECS[codec.mimeType];
    if (!rates) return false;
    return rates === "any" || rates.includes(codec.clockRate);
}
