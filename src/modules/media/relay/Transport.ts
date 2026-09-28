import type { CallAudio } from "@/domain/call/audio";
import type { MediaPlan } from "@/domain/call/mediaPlan";
import type { CallStats } from "@/domain/call/stats";
import type { CallFailureCode, WavoipError } from "@/domain/shared/errors";
import type { RelayAddress } from "@/modules/media/ITransport";
import type { Events, ITransport, MediaRuntime, TransportStatus } from "@/modules/media/ITransport";
import { WSAudioPipe } from "@/modules/media/relay/AudioPipe";
import { WSConnection } from "@/modules/media/relay/Connection";
import { WSStatsAdapter } from "@/modules/media/relay/StatsAdapter";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import type { MediaSocketFactory } from "@/ports/runtime/MediaSocketPort";

/** A etapa que falhou ao subir a mídia, presa à causa que a plataforma deu. */
class MediaStartError extends Error {
    constructor(
        readonly code: CallFailureCode,
        cause: unknown,
    ) {
        super(`a mídia do relay não subiu: ${code}`, { cause });
    }

    /** O que sai no evento. Erro sem etiqueta ainda é falha, e vira `UNKNOWN` em vez de sumir. */
    static failureOf(error: unknown): WavoipError<CallFailureCode | "UNKNOWN"> {
        if (error instanceof MediaStartError) return { code: error.code, cause: error.cause };
        return { code: "UNKNOWN", cause: error };
    }
}

export class WebsocketTransport extends EventEmitter<Events> implements ITransport {
    public readonly kind = "ws" as const;
    public peerMuted = false;

    get status(): TransportStatus {
        return this.connection.status;
    }

    get audio(): CallAudio {
        return this.audioPipe.audio;
    }

    get stats(): CallStats {
        return this.statsAdapter.snapshot();
    }

    private readonly connection: WSConnection;
    private readonly audioPipe: WSAudioPipe;
    private readonly statsAdapter: WSStatsAdapter;

    constructor(runtime: MediaRuntime, token: string) {
        super();

        this.connection = new WSConnection(token, socketFactoryOf(runtime));

        this.audioPipe = new WSAudioPipe(runtime, (data) => {
            this.connection.send(data);
            this.statsAdapter.noteSent(data.byteLength);
        });

        this.statsAdapter = new WSStatsAdapter(runtime.engine, {
            readTxLevel: () => this.audioPipe.readTxLevel(),
            readRxLevel: () => this.audioPipe.readRxLevel(),
            readBufferedMs: () => this.audioPipe.readBufferedMs(),
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
        this.startWithoutWaiting();
        return { type: "none" };
    }

    /**
     * Subir em paralelo tem um preço: o que falha aqui não tem para quem voltar. Quem liga
     * recebe a falha pelo `await` do `connect`; quem atende recebia `ok` e ficava com uma
     * chamada de pé e muda para sempre. Por isso a falha vira evento.
     */
    private startWithoutWaiting(): void {
        this.start().catch((error) => this.emit("failed", MediaStartError.failureOf(error)));
    }

    /** O outro lado atendeu: a resposta diz onde o relay espera a conexão. */
    async connect(plan: MediaPlan): Promise<void> {
        if (plan.type !== "relay") {
            throw new Error(
                `a chamada não oficial precisa de um plano \`relay\` para conectar, e recebeu ${JSON.stringify(plan)}`,
            );
        }
        this.useRelay(plan);
        await this.start();
    }

    /**
     * Cada etapa é etiquetada onde falha: quem atende recebe só o evento, e "a chamada
     * falhou" sem dizer qual metade manda o integrador depurar o microfone quando o problema
     * era a resposta do servidor.
     */
    private async start(): Promise<void> {
        try {
            await this.audioPipe.start();
        } catch (cause) {
            throw new MediaStartError("LOCAL_AUDIO_FAILED", cause);
        }
        try {
            await this.connection.start();
        } catch (cause) {
            throw new MediaStartError("SERVER_ERROR", cause);
        }
    }

    async stop(): Promise<void> {
        await this.connection.stop();
        await this.audioPipe.stop();
    }

    async getStats(): Promise<CallStats> {
        await this.statsAdapter.refresh();
        return this.statsAdapter.snapshot();
    }
}

/** Sem socket binário na plataforma não há chamada UNOFFICIAL. */
function socketFactoryOf(runtime: MediaRuntime): MediaSocketFactory {
    // Quem monta o transporte já conferiu que a fábrica existe: sem ela, o `forCall` devolve
    // `null` e a chamada é recusada antes de chegar aqui.
    const { openSocket } = runtime;
    if (!openSocket)
        throw new TypeError(
            `runtime sem openSocket chegou ao WebsocketTransport: ${JSON.stringify(Object.keys(runtime))}`,
        );
    return openSocket;
}
