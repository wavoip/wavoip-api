import { CallRegistry } from "@/application/call/CallRegistry";
import { CallSession, type CallSessionInit } from "@/application/call/CallSession";
import type { MediaPlan } from "@/domain/call/types";
import type { ITransport } from "@/modules/media/ITransport";
import { FakeCallSignaling } from "@/test/fakes/FakeCallSignaling";
import { FakeTransportFactory } from "@/test/fakes/FakeTransportFactory";

export const testPeer = { phone: "5511999999999", displayName: "Test", profilePicture: null };
export const webRTCPlan: MediaPlan = { type: "webRTC", sdp: "v=0 remote-offer" };
export const relayPlan: MediaPlan = { type: "relay", host: "relay.host", port: "443" };

/** Monta sessões já roteadas, para o teste falar com elas como o servidor fala. */
export class CallHarness {
    readonly signaling = new FakeCallSignaling();
    readonly transports = new FakeTransportFactory();
    readonly muted: boolean[] = [];
    readonly registry = new CallRegistry(this.signaling);

    /** Oferta recebida: o transporte já nasce sabendo o plano que veio nela. */
    incoming(init: Partial<CallSessionInit> & { plan?: MediaPlan } = {}): CallSession {
        const { plan = webRTCPlan, ...rest } = init;
        const transport = this.transports.forOffer(plan, "device-token");
        return this.session({ direction: "INCOMING", status: "CALLING", transport, ...rest });
    }

    /** Chamada que saiu e já foi aceita pelo servidor: o transporte veio do tipo do device. */
    outgoing(init: Partial<CallSessionInit> = {}): CallSession {
        const transport = this.transports.forCall(init.type ?? "OFFICIAL");
        return this.session({ direction: "OUTGOING", status: "RINGING", transport, ...init });
    }

    /** O que o servidor manda para a chamada, pelo caminho de verdade (porta → registry). */
    fromServer(session: CallSession, ...events: Parameters<CallSession["handleServerEvent"]>[0][]): void {
        for (const event of events) this.signaling.receiveCallEvent(session.id, event);
    }

    private session(init: Partial<CallSessionInit> & { transport: ITransport }): CallSession {
        const session = new CallSession(
            {
                signaling: this.signaling,
                transports: this.transports,
                setLocalMuted: (value) => this.muted.push(value),
            },
            {
                id: "call-1",
                type: "OFFICIAL",
                direction: "INCOMING",
                peer: testPeer,
                deviceToken: "device-token",
                status: "CALLING",
                ...init,
            },
        );
        this.registry.register(session);
        return session;
    }
}
