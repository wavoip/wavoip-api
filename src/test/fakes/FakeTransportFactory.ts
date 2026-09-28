import type { TransportFactory } from "@/application/call/CallSession";
import type { MediaPlan } from "@/domain/call/mediaPlan";
import type { CallType } from "@/domain/call/types";
import type { ITransport } from "@/modules/media/ITransport";
import { FakeRTCTransport, FakeTransport } from "@/test/fakes/FakeTransport";

/** Guarda o que foi montado, para o teste ver qual transporte a chamada recebeu. */
export class FakeTransportFactory implements TransportFactory {
    readonly opened: (FakeTransport | FakeRTCTransport)[] = [];
    readonly plans: MediaPlan[] = [];
    /** Os tipos que esta "plataforma" não carrega, como um runtime sem WebRTC ou sem socket. */
    readonly unsupported = new Set<CallType>();

    forCall(type: CallType): ITransport | null {
        if (this.unsupported.has(type)) return null;
        return this.open(type === "OFFICIAL" ? new FakeRTCTransport() : new FakeTransport());
    }

    forOffer(plan: MediaPlan, _deviceToken: string): ITransport {
        this.plans.push(plan);
        return this.open(plan.type === "webRTC" ? new FakeRTCTransport() : new FakeTransport());
    }

    /**
     * Para o teste que já sabe que o tipo é suportado: falha alto em vez de espalhar `!`
     * pelos helpers, e diz qual tipo foi recusado se alguém mexer no `unsupported`.
     */
    required(type: CallType): ITransport {
        const transport = this.forCall(type);
        if (!transport) throw new Error(`o teste pediu um transporte ${type}, que este fake recusa`);
        return transport;
    }

    /** O último montado é o da chamada em teste. */
    get current(): FakeTransport | FakeRTCTransport {
        return this.opened[this.opened.length - 1];
    }

    private open<T extends FakeTransport | FakeRTCTransport>(transport: T): T {
        this.opened.push(transport);
        return transport;
    }
}
