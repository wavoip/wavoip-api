import { Status } from "@/domain/call/status";
import type { MediaPlan } from "@/domain/call/types";
import type { ClientEvents, DeviceSocket, ServerEvents, WssResponse } from "@/modules/device/WebSocket";
import {
    Ack,
    type CallSignalingPort,
    type IncomingOffer,
    type ServerCallEvent,
    type SignalAck,
    type StartedCall,
    type Unsubscribe,
} from "@/ports/SignalingPort";

type CommandName = keyof ClientEvents & string;
type CallEventListener = (callId: string, event: ServerCallEvent) => void;
type OfferListener = (offer: IncomingOffer) => void;

type SocketLike = {
    on(event: string, handler: unknown): unknown;
    off(event: string, handler: unknown): unknown;
};

/**
 * O `timeout(ms).emitWithAck` do socket.io rejeita a Promise quando o teto vence: o `catch`
 * de cada comando é o ack que nunca chegou.
 *
 * Um listener por evento no socket compartilhado, e não um por chamada: quem separa por
 * `callId` é quem escuta esta porta.
 */
export class SocketIoSignaling implements CallSignalingPort {
    private readonly callListeners = new Set<CallEventListener>();
    private readonly offerListeners = new Set<OfferListener>();
    private readonly unbinds: Unsubscribe[] = [];

    constructor(private readonly socket: DeviceSocket) {
        this.bindCallEvents();
    }

    async startCall(to: string, plan: MediaPlan, timeoutMs: number): Promise<SignalAck<StartedCall>> {
        return this.ask(timeoutMs, "call.start", to, plan);
    }

    async cancel(callId: string, timeoutMs: number): Promise<SignalAck> {
        return this.ask<void>(timeoutMs, "call.cancel", callId);
    }

    async mute(callId: string, muted: boolean, timeoutMs: number): Promise<SignalAck> {
        return this.ask<void>(timeoutMs, "call.mute", callId, muted);
    }

    async accept(callId: string, answer: MediaPlan, timeoutMs: number): Promise<SignalAck> {
        return this.ask<void>(timeoutMs, "call.accept", callId, answer);
    }

    async reject(callId: string, timeoutMs: number): Promise<SignalAck> {
        return this.ask<void>(timeoutMs, "call.reject", callId);
    }

    async end(callId: string, timeoutMs: number): Promise<SignalAck> {
        return this.ask<void>(timeoutMs, "call.end", callId);
    }

    onCallEvent(listener: CallEventListener): Unsubscribe {
        this.callListeners.add(listener);
        return () => this.callListeners.delete(listener);
    }

    onOffer(listener: OfferListener): Unsubscribe {
        this.offerListeners.add(listener);
        return () => this.offerListeners.delete(listener);
    }

    dispose(): void {
        for (const unbind of this.unbinds) unbind();
        this.unbinds.length = 0;
        this.callListeners.clear();
        this.offerListeners.clear();
    }

    /** Uma linha por evento do servidor: o nome no protocolo e o que ele vira aqui. */
    private bindCallEvents(): void {
        this.bind("call:ringing", (id) => this.announce(id, { type: "ringing" }));
        this.bind("call:accepted", (id) => this.announce(id, { type: "accepted" }));
        this.bind("call:answered", (id, plan) => this.announce(id, { type: "answered", plan }));
        this.bind("call:rejected", (id) => this.announce(id, { type: "rejected" }));
        this.bind("call:unanswered", (id) => this.announce(id, { type: "unanswered" }));
        this.bind("call:failed", (id, reason) => this.announce(id, { type: "failed", reason }));
        // `Status.narrow` porque o servidor tem mais desfechos que a união pública (os
        // `*_ELSEWHERE`), e a instance antiga não manda nenhum: os dois casos viram ENDED.
        this.bind("call:ended", (id, out) => this.announce(id, { type: "ended", status: Status.narrow(out?.status) }));
        this.bind("call:disconnected", (id) => this.announce(id, { type: "disconnected" }));
        this.bind("call:connected", (id) => this.announce(id, { type: "connected" }));
        this.bind("call:stats", (id, stats) => this.announce(id, { type: "stats", stats }));
        this.bind("call:peer:muted", (id, muted) => this.announce(id, { type: "peerMuted", muted }));
        // O ack da oferta sai antes de qualquer listener rodar: o servidor espera a
        // confirmação de entrega, não a decisão de quem atende.
        this.bind("call:offer", ({ id, peer, offer }, ackOffer) => {
            ackOffer();
            for (const listener of this.offerListeners) listener({ id, peer, plan: offer });
        });
    }

    private announce(callId: string, event: ServerCallEvent): void {
        for (const listener of this.callListeners) listener(callId, event);
    }

    // O Socket tipado do socket.io expõe um FallbackToUntypedListener que o compilador não
    // unifica com o genérico daqui. O cast mora só aqui, e cada handler acima fica tipado
    // pelo contrato do servidor.
    /**
     * Manda o comando e traduz a resposta. O `timeout(ms).emitWithAck` rejeita a Promise
     * quando o teto vence, então o `catch` é o ack que nunca chegou.
     */
    private async ask<T>(timeoutMs: number, event: CommandName, ...args: unknown[]): Promise<SignalAck<T>> {
        try {
            const socket = this.socket.timeout(timeoutMs) as unknown as {
                emitWithAck(event: string, ...args: unknown[]): Promise<WssResponse<T & (string | object)>>;
            };
            const response = await socket.emitWithAck(event, ...args);
            if (response.type === "error") return Ack.Refuse(response.result);
            return Ack.Ok((response as { result?: T }).result as T);
        } catch {
            return Ack.Timeout();
        }
    }

    private bind<E extends keyof ServerEvents>(event: E, handler: ServerEvents[E]): void {
        const socket = this.socket as unknown as SocketLike;
        socket.on(event, handler);
        this.unbinds.push(() => {
            socket.off(event, handler);
        });
    }
}
