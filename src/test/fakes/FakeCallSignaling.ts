import type { MediaPlan } from "@/domain/call/types";
import {
    Ack,
    type CallSignalingPort,
    type IncomingOffer,
    type ServerCallEvent,
    type SignalAck,
    type StartedCall,
    type Unsubscribe,
} from "@/ports/SignalingPort";

type Sent = { command: string; callId?: string; payload?: unknown };

/**
 * Sinalização em memória: `sent` guarda o que a chamada pediu, os campos `*Answer` decidem
 * o que o servidor responde, e `receive*` simula o servidor falando primeiro.
 */
export class FakeCallSignaling implements CallSignalingPort {
    readonly sent: Sent[] = [];
    startAnswer: SignalAck<StartedCall> = Ack.Ok({ id: "call-1", peer: fakePeer() });
    cancelAnswer: SignalAck = Ack.Ok();
    muteAnswer: SignalAck = Ack.Ok();
    acceptAnswer: SignalAck = Ack.Ok();
    rejectAnswer: SignalAck = Ack.Ok();
    endAnswer: SignalAck = Ack.Ok();
    disposed = false;

    private readonly callListeners = new Set<(callId: string, event: ServerCallEvent) => void>();
    private readonly offerListeners = new Set<(offer: IncomingOffer) => void>();

    async startCall(to: string, plan: MediaPlan): Promise<SignalAck<StartedCall>> {
        this.sent.push({ command: "start", payload: { to, plan } });
        return this.startAnswer;
    }

    async cancel(callId: string): Promise<SignalAck> {
        this.sent.push({ command: "cancel", callId });
        return this.cancelAnswer;
    }

    async mute(callId: string, muted: boolean): Promise<SignalAck> {
        this.sent.push({ command: "mute", callId, payload: muted });
        return this.muteAnswer;
    }

    async accept(callId: string, answer: MediaPlan): Promise<SignalAck> {
        this.sent.push({ command: "accept", callId, payload: answer });
        return this.acceptAnswer;
    }

    async reject(callId: string): Promise<SignalAck> {
        this.sent.push({ command: "reject", callId });
        return this.rejectAnswer;
    }

    async end(callId: string): Promise<SignalAck> {
        this.sent.push({ command: "end", callId });
        return this.endAnswer;
    }

    onCallEvent(listener: (callId: string, event: ServerCallEvent) => void): Unsubscribe {
        this.callListeners.add(listener);
        return () => this.callListeners.delete(listener);
    }

    onOffer(listener: (offer: IncomingOffer) => void): Unsubscribe {
        this.offerListeners.add(listener);
        return () => this.offerListeners.delete(listener);
    }

    dispose(): void {
        this.disposed = true;
        this.callListeners.clear();
        this.offerListeners.clear();
    }

    receiveCallEvent(callId: string, event: ServerCallEvent): void {
        for (const listener of this.callListeners) listener(callId, event);
    }

    receiveOffer(offer: IncomingOffer): void {
        for (const listener of this.offerListeners) listener(offer);
    }

    commands(): string[] {
        return this.sent.map((s) => s.command);
    }
}

function fakePeer() {
    return { phone: "5511999999999", displayName: "Test", profilePicture: null };
}
