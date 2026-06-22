import type { CallStats } from "@/modules/call/Stats";
import { WSAudioPipe, WSConnection, WSStatsAdapter } from "@/modules/media/composition";
import type { Events, ITransport, TransportStatus } from "@/modules/media/ITransport";
import type { MediaManager } from "@/modules/media/MediaManager";
import { EventEmitter } from "@/modules/shared/EventEmitter";

const STATS_TICK_MS = 200;

export class WebsocketTransport extends EventEmitter<Events> implements ITransport {
    public readonly kind = "ws" as const;
    public peerMuted = false;
    public audioAnalyser: Promise<AnalyserNode>;

    get status(): TransportStatus {
        return this.connection.status;
    }

    get stats(): CallStats {
        return this.statsAdapter.snapshot();
    }

    private readonly connection: WSConnection;
    private readonly audioPipe: WSAudioPipe;
    private readonly statsAdapter: WSStatsAdapter;

    private statsTimer: ReturnType<typeof setInterval> | null = null;

    constructor(mediaManager: MediaManager, server: { host: string; port: string }, token: string) {
        super();

        this.connection = new WSConnection(server, token);

        this.audioPipe = new WSAudioPipe(mediaManager, (data) => {
            this.connection.send(data);
            this.statsAdapter.noteSent(data.byteLength);
        });
        this.audioAnalyser = this.audioPipe.audioAnalyser;

        this.statsAdapter = new WSStatsAdapter(mediaManager.audioContext, {
            readTxLevel: () => this.audioPipe.readTxLevel(),
            readRxLevel: () => this.audioPipe.readRxLevel(),
        });

        this.connection.on("statusChanged", (s) => this.emit("statusChanged", s));
        this.connection.on("message", (data) => {
            this.statsAdapter.noteReceived(data.byteLength);
            this.audioPipe.playInbound(data);
        });
    }

    async start(): Promise<void> {
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
        this.statsTimer = setInterval(() => void this.tickStats(), STATS_TICK_MS);
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
