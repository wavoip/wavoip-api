import type { CallStats } from "@/domain/call/stats";
import type { MediaPlan } from "@/domain/call/types";
import type { RelayAddress } from "@/modules/media/ITransport";
import { WSAudioPipe } from "@/modules/media/relay/AudioPipe";
import { WSConnection } from "@/modules/media/relay/Connection";
import { WSStatsAdapter } from "@/modules/media/relay/StatsAdapter";
import {
    type AudioRuntime,
    DEFAULT_STATS_TICK_MS,
    type Events,
    type ITransport,
    type TransportOptions,
    type TransportStatus,
} from "@/modules/media/ITransport";
import { EventEmitter } from "@/modules/shared/EventEmitter";

export class WebsocketTransport extends EventEmitter<Events> implements ITransport {
    public readonly kind = "ws" as const;
    public peerMuted = false;
    public audioAnalyserIn: Promise<AnalyserNode>;
    public audioAnalyserOut: Promise<AnalyserNode>;

    get status(): TransportStatus {
        return this.connection.status;
    }

    get stats(): CallStats {
        return this.statsAdapter.snapshot();
    }

    private readonly connection: WSConnection;
    private readonly audioPipe: WSAudioPipe;
    private readonly statsAdapter: WSStatsAdapter;
    private readonly statsTickMs: number;

    private statsTimer: ReturnType<typeof setInterval> | null = null;

    constructor(audio: AudioRuntime, token: string, options?: TransportOptions) {
        super();

        this.statsTickMs = options?.statsTickMs ?? DEFAULT_STATS_TICK_MS;
        this.connection = new WSConnection(token);

        this.audioPipe = new WSAudioPipe(audio, (data) => {
            this.connection.send(data);
            this.statsAdapter.noteSent(data.byteLength);
        });
        this.audioAnalyserIn = this.audioPipe.audioAnalyserIn;
        this.audioAnalyserOut = this.audioPipe.audioAnalyserOut;

        this.statsAdapter = new WSStatsAdapter(audio.engine, {
            readTxLevel: () => this.audioPipe.readTxLevel(),
            readRxLevel: () => this.audioPipe.readRxLevel(),
        });

        this.connection.on("statusChanged", (s) => this.emit("statusChanged", s));
        this.connection.on("message", (data) => {
            this.statsAdapter.noteReceived(data.byteLength);
            this.audioPipe.playInbound(data);
        });
    }

    /** Onde o relay atende, conhecido só quando a chamada é aceita. */
    useRelay(server: RelayAddress): void {
        this.connection.useRelay(server);
    }

    /**
     * Atende: o relay não tem plano para mandar de volta, e a conexão sobe em paralelo —
     * a chamada já existe enquanto o `connectionStatus` mostra o relay conectando.
     */
    async accept(): Promise<MediaPlan> {
        void this.start();
        return { type: "none" };
    }

    /** O outro lado atendeu: a resposta diz onde o relay espera a conexão. */
    async connect(plan: MediaPlan): Promise<void> {
        if (plan.type !== "relay") throw new Error(`A relay call cannot connect with a ${plan.type} plan`);
        this.useRelay(plan);
        await this.start();
    }

    private async start(): Promise<void> {
        await this.audioPipe.start();
        await this.connection.start();
        this.startStatsLoop();
    }

    async stop(): Promise<void> {
        this.stopStatsLoop();
        await this.connection.stop();
        await this.audioPipe.stop();
    }

    private startStatsLoop(): void {
        this.statsTimer = setInterval(() => void this.tickStats(), this.statsTickMs);
    }

    private stopStatsLoop(): void {
        if (this.statsTimer) {
            clearInterval(this.statsTimer);
            this.statsTimer = null;
        }
    }

    async getStats(): Promise<CallStats> {
        await this.statsAdapter.refresh();
        return this.statsAdapter.snapshot();
    }

    private async tickStats(): Promise<void> {
        await this.statsAdapter.refresh();
        this.emit("statsChanged", this.statsAdapter.snapshot());
    }
}
