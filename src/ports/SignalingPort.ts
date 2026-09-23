import type { ServerCallStats } from "@/domain/call/stats";
import type { CallStatus, CallType, MediaPlan, Peer } from "@/domain/call/types";
import type { CallFailureCode, CommandErrorCode, WavoipError } from "@/domain/shared/errors";
import type { Contact, DeviceStatus } from "@/modules/device/Device";

/**
 * A sinalização da chamada como a biblioteca precisa dela, sem socket.io no meio. O
 * adaptador traduz o protocolo do servidor para estes tipos, e é o único lugar que
 * conhece os nomes `call:*`.
 *
 * Todo comando espera o ack: sem ele, a biblioteca contaria ao integrador um desfecho que
 * o servidor talvez nunca tenha visto — e a chamada continuaria de pé do outro lado.
 */

/** Resposta do servidor a um comando. `timeout` é o ack que nunca chegou. */
export type RefusalCode = CommandErrorCode | "UNKNOWN";

export type SignalAck<T = void> =
    | { readonly kind: "ok"; readonly value: T }
    | { readonly kind: "refused"; readonly code: RefusalCode; readonly cause?: unknown }
    | { readonly kind: "timeout" };

/** Fábrica das três respostas, para os adaptadores não repetirem a forma do `SignalAck`. */
function ok(): SignalAck<void>;
function ok<T>(value: T): SignalAck<T>;
function ok<T>(value?: T): SignalAck<T> {
    return { kind: "ok", value: value as T };
}

function refuse(code: RefusalCode, cause?: unknown): SignalAck<never> {
    return { kind: "refused", code, cause };
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
    | { readonly type: "failed"; readonly error: WavoipError<CallFailureCode | "UNKNOWN"> }
    // `status` vem estreitado: a instance antiga não manda desfecho, e aí é ENDED.
    | { readonly type: "ended"; readonly status: CallStatus }
    | { readonly type: "disconnected" }
    | { readonly type: "connected" }
    | { readonly type: "stats"; readonly stats: ServerCallStats }
    | { readonly type: "peerMuted"; readonly muted: boolean };

export type Unsubscribe = () => void;

/** O que o servidor conta sobre o device, já no vocabulário da biblioteca. */
export type ServerDeviceEvent =
    | {
          readonly type: "init";
          readonly status: DeviceStatus;
          readonly callType: CallType;
          readonly contact: Contact | null;
          readonly qrCode: string | null;
          readonly restricted: boolean;
          readonly restrictedUntil: Date | null;
          readonly activeCalls: number;
      }
    | { readonly type: "building" }
    | { readonly type: "open"; readonly contact: Contact }
    | { readonly type: "connecting"; readonly qrCode: string | null }
    | { readonly type: "close" }
    | { readonly type: "restarting" }
    | { readonly type: "hibernating" }
    | { readonly type: "restriction"; readonly restricted: boolean; readonly restrictedUntil: Date | null }
    | { readonly type: "activeCalls"; readonly count: number };

export interface DeviceSignalingPort {
    connect(): void;
    disconnect(): void;
    /** O socket.io ainda está tentando por conta própria: reconectar por cima duplicaria. */
    isRetrying(): boolean;
    isConnected(): boolean;
    onDeviceEvent(listener: (event: ServerDeviceEvent) => void): Unsubscribe;
    /** A conexão caiu, por queda de rede ou porque o servidor encerrou. */
    onConnectionLost(listener: () => void): Unsubscribe;
    requestPairingCode(phone: string, timeoutMs: number): Promise<SignalAck<string>>;
}

export interface CallSignalingPort {
    startCall(to: string, plan: MediaPlan, timeoutMs: number): Promise<SignalAck<StartedCall>>;
    accept(callId: string, answer: MediaPlan, timeoutMs: number): Promise<SignalAck>;
    reject(callId: string, timeoutMs: number): Promise<SignalAck>;
    end(callId: string, timeoutMs: number): Promise<SignalAck>;
    cancel(callId: string, timeoutMs: number): Promise<SignalAck>;
    mute(callId: string, muted: boolean, timeoutMs: number): Promise<SignalAck>;
    onOffer(listener: (offer: IncomingOffer) => void): Unsubscribe;
    onCallEvent(listener: (callId: string, event: ServerCallEvent) => void): Unsubscribe;
    dispose(): void;
}
