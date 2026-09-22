import type { CallFailReason } from "@/domain/call/failReason";
import type { ServerCallStats } from "@/domain/call/stats";
import type { CallStatus, MediaPlan, Peer } from "@/domain/call/types";

/**
 * A sinalização da chamada como a biblioteca precisa dela, sem socket.io no meio. O
 * adaptador traduz o protocolo do servidor para estes tipos, e é o único lugar que
 * conhece os nomes `call:*`.
 */

/** Resposta do servidor a um comando. `timeout` é o ack que nunca chegou. */
export type SignalAck<T = void> =
    | { readonly kind: "ok"; readonly value: T }
    | { readonly kind: "refused"; readonly code: string }
    | { readonly kind: "timeout" };

/** Fábrica das três respostas, para os adaptadores não repetirem a forma do `SignalAck`. */
function ok(): SignalAck<void>;
function ok<T>(value: T): SignalAck<T>;
function ok<T>(value?: T): SignalAck<T> {
    return { kind: "ok", value: value as T };
}

function refuse(code: string): SignalAck<never> {
    return { kind: "refused", code };
}

function timeout(): SignalAck<never> {
    return { kind: "timeout" };
}

export const Ack = { Ok: ok, Refuse: refuse, Timeout: timeout };

export type StartedCall = { readonly id: string; readonly peer: Peer };

export type IncomingOffer = { readonly id: string; readonly peer: Peer; readonly plan: MediaPlan };

/** O que o servidor conta sobre uma chamada que já existe. */
export type ServerCallEvent =
    | { readonly type: "ringing" }
    | { readonly type: "accepted" }
    | { readonly type: "answered"; readonly plan: MediaPlan }
    | { readonly type: "rejected" }
    | { readonly type: "unanswered" }
    | { readonly type: "failed"; readonly reason: CallFailReason }
    // `status` vem estreitado: a instance antiga não manda desfecho, e aí é ENDED.
    | { readonly type: "ended"; readonly status: CallStatus }
    | { readonly type: "disconnected" }
    | { readonly type: "connected" }
    | { readonly type: "stats"; readonly stats: ServerCallStats }
    | { readonly type: "peerMuted"; readonly muted: boolean };

export type Unsubscribe = () => void;

export interface CallSignalingPort {
    startCall(to: string, plan: MediaPlan, timeoutMs: number): Promise<SignalAck<StartedCall>>;
    // Sem ack: o servidor responde, mas nada do que ele diz muda o que a chamada faz.
    accept(callId: string, answer: MediaPlan): void;
    reject(callId: string): void;
    end(callId: string): void;
    cancel(callId: string, timeoutMs: number): Promise<SignalAck>;
    mute(callId: string, muted: boolean, timeoutMs: number): Promise<SignalAck>;
    onOffer(listener: (offer: IncomingOffer) => void): Unsubscribe;
    onCallEvent(listener: (callId: string, event: ServerCallEvent) => void): Unsubscribe;
    dispose(): void;
}
