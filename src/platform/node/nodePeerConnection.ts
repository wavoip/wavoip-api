import { RTCPeerConnection, RTCRtpSender } from "@/platform/node/wrtc";
import type { PeerConnectionFactory, PeerConnectionLike, SessionDescription } from "@/ports/runtime/PeerConnectionPort";

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
    preferBrowserCodecsOnEveryDescription(pc);
    return pc as unknown as PeerConnectionLike;
};

/**
 * O `@roamhq/wrtc` empacota libwebrtc M106 (Chrome 106, de 2022) e anuncia codecs que
 * navegador nenhum anuncia mais: ISAC em 16 e 32 kHz, ILBC, CN em 16 e 32 kHz,
 * telephone-event em 16 e 32 kHz. São 15 payloads no SDP, contra 8 do Chrome de hoje.
 *
 * O SDP sai com os 8 porque quem recebe o nosso numa chamada oficial é o WhatsApp, e o que se
 * sabe que ele aceita é o do navegador. Oferecer codec que ninguém escolhe só dá ao outro lado
 * mais chance de tropeçar.
 *
 * A preferência é aplicada na hora de produzir o SDP, e não na criação da conexão. Criar o
 * transceiver adiantado para configurá-lo parece equivalente e não é: ao aplicar a oferta
 * remota, o libwebrtc associa a linha de mídia dela a um transceiver **novo**, e o nosso — o
 * que carrega a track — fica de fora. A resposta saía `recvonly`: a gente ouvia o contato, o
 * contato não ouvia nada, e a gravação local ainda mostrava a nossa voz, porque ela copia a
 * fonte e não o que foi para a rede.
 */
function preferBrowserCodecsOnEveryDescription(pc: RTCPeerConnection): void {
    // Só a forma que devolve Promise interessa; as sobrecargas com callback do wrtc são de
    // uma era anterior à Promise, e o núcleo nunca as usa.
    const produce = pc as unknown as {
        createOffer(): Promise<SessionDescription>;
        createAnswer(): Promise<SessionDescription>;
    };
    const createOffer = produce.createOffer.bind(pc);
    const createAnswer = produce.createAnswer.bind(pc);

    produce.createOffer = () => {
        prefer(pc);
        return createOffer();
    };
    produce.createAnswer = () => {
        prefer(pc);
        return createAnswer();
    };
}

function prefer(pc: RTCPeerConnection): void {
    const codecs = RTCRtpSender.getCapabilities("audio")?.codecs.filter(isBrowserCodec);
    if (!codecs?.length) return;

    for (const transceiver of pc.getTransceivers()) {
        if (transceiver.receiver?.track?.kind === "audio") transceiver.setCodecPreferences(codecs);
    }
}

function isBrowserCodec(codec: { mimeType: string; clockRate: number }): boolean {
    const rates = BROWSER_CODECS[codec.mimeType];
    if (!rates) return false;
    return rates === "any" || rates.includes(codec.clockRate);
}
