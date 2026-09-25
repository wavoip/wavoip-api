import type { ConnectivityIssue, IceDiagnostics } from "@/domain/call/ice";
import { type CallStats, Stats } from "@/domain/call/stats";
import type { MediaPlan } from "@/domain/call/mediaPlan";
import type { TransportStatus } from "@/domain/call/types";
import type { Events, IRTCTransport, IWSTransport } from "@/modules/media/ITransport";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import type { CallAudio } from "@/domain/call/audio";

/** O que os dois transportes falsos têm em comum: sem rede, sem áudio, e contando chamadas. */
abstract class FakeTransportBase extends EventEmitter<Events> {
    status: TransportStatus = "connected";
    peerMuted = false;
    /** O teste ajusta os níveis mexendo direto nestes campos. */
    levels = { in: 0, out: 0 };
    readonly audio: CallAudio = {
        in: { level: () => this.levels.in, spectrum: () => new Uint8Array(0) },
        out: { level: () => this.levels.out, spectrum: () => new Uint8Array(0) },
    };
    stats: CallStats = Stats.empty();
    starts = 0;
    stops = 0;
    connected = false;
    startFailure: Error | null = null;
    /** Deixa o `start` pendente, como uma conexão que ainda não completou. */
    blockedStart: Promise<void> | null = null;

    async start(): Promise<void> {
        this.starts += 1;
        if (this.startFailure) throw this.startFailure;
        if (this.blockedStart) await this.blockedStart;
        this.connected = true;
    }

    /** Como um transporte de verdade: grava o estado novo e só então anuncia. */
    changeStatus(status: TransportStatus): void {
        this.status = status;
        this.emit("statusChanged", status);
    }

    blockStart(): void {
        this.blockedStart = new Promise(() => {});
    }

    abstract accept(): Promise<MediaPlan>;

    abstract connect(plan: MediaPlan): Promise<void>;

    async stop(): Promise<void> {
        this.stops += 1;
    }

    async getStats(): Promise<CallStats> {
        return this.stats;
    }
}

/** Transporte de relay: só conecta quando o servidor diz onde ele atende. */
export class FakeTransport extends FakeTransportBase implements IWSTransport {
    readonly kind = "ws" as const;
    relay: { host: string; port: string } | null = null;

    useRelay(server: { host: string; port: string }): void {
        this.relay = server;
    }

    async accept(): Promise<MediaPlan> {
        void this.start();
        return { type: "none" };
    }

    async connect(plan: MediaPlan): Promise<void> {
        if (plan.type !== "relay") throw new Error(`A relay call cannot connect with a ${plan.type} plan`);
        this.useRelay(plan);
        await this.start();
    }
}

/** Transporte WebRTC: oferta, resposta e o que o ICE juntou antes de a mídia ser ligada. */
export class FakeRTCTransport extends FakeTransportBase implements IRTCTransport {
    readonly kind = "webrtc" as const;
    lastDiagnostics: IceDiagnostics | null = null;
    emittedConnectivityIssues: ReadonlySet<ConnectivityIssue> = new Set();
    offers = 0;
    answers: string[] = [];

    async createOffer(): Promise<string> {
        this.offers += 1;
        return "v=0 local-offer";
    }

    async accept(): Promise<MediaPlan> {
        await this.start();
        return { type: "webRTC", sdp: "v=0 local-answer" };
    }

    async connect(plan: MediaPlan): Promise<void> {
        if (plan.type !== "webRTC") throw new Error(`A WebRTC call cannot connect with a ${plan.type} plan`);
        this.answers.push(plan.sdp);
        await this.start();
    }
}
