import type { ConnectivityIssue, IceDiagnostics } from "@/domain/call/ice";
import { type CallStats, Stats } from "@/domain/call/stats";
import type { TransportStatus } from "@/domain/call/types";
import type { Events, IRTCTransport, ITransport } from "@/modules/media/ITransport";
import { EventEmitter } from "@/modules/shared/EventEmitter";

/** O que os dois transportes falsos têm em comum: sem rede, sem áudio, e contando chamadas. */
abstract class FakeTransportBase extends EventEmitter<Events> {
    status: TransportStatus = "connected";
    peerMuted = false;
    audioAnalyserIn: Promise<AnalyserNode> = Promise.resolve({} as AnalyserNode);
    audioAnalyserOut: Promise<AnalyserNode> = Promise.resolve({} as AnalyserNode);
    stats: CallStats = Stats.empty();
    starts = 0;
    stops = 0;
    startFailure: Error | null = null;

    async start(): Promise<void> {
        this.starts += 1;
        if (this.startFailure) throw this.startFailure;
    }

    async stop(): Promise<void> {
        this.stops += 1;
    }

    async getStats(): Promise<CallStats> {
        return this.stats;
    }
}

/** Transporte de relay. */
export class FakeTransport extends FakeTransportBase implements ITransport {
    readonly kind = "ws" as const;
}

/** Transporte WebRTC: oferta, resposta e o que o ICE juntou antes de a mídia ser ligada. */
export class FakeRTCTransport extends FakeTransportBase implements IRTCTransport {
    readonly kind = "webrtc" as const;
    answer: Promise<RTCSessionDescriptionInit> = Promise.resolve({ type: "answer", sdp: "v=0 local-answer" });
    lastDiagnostics: IceDiagnostics | null = null;
    emittedConnectivityIssues: ReadonlySet<ConnectivityIssue> = new Set();
    offers = 0;
    answers: string[] = [];

    async createOffer(): Promise<string> {
        this.offers += 1;
        return "v=0 local-offer";
    }

    async setAnswer(sdp: string): Promise<void> {
        this.answers.push(sdp);
    }
}
