import type { TransportFactory } from "@/application/call/CallSession";
import type { MediaPlan } from "@/domain/call/mediaPlan";
import type { CallType } from "@/domain/call/types";
import type { ITransport } from "@/modules/media/ITransport";
import { FakeRTCTransport, FakeTransport } from "@/test/fakes/FakeTransport";

/** Guarda o que foi montado, para o teste ver qual transporte a chamada recebeu. */
export class FakeTransportFactory implements TransportFactory {
    readonly opened: (FakeTransport | FakeRTCTransport)[] = [];
    readonly plans: MediaPlan[] = [];

    forCall(type: CallType): ITransport {
        return this.open(type === "OFFICIAL" ? new FakeRTCTransport() : new FakeTransport());
    }

    forOffer(plan: MediaPlan, _deviceToken: string): ITransport {
        this.plans.push(plan);
        return this.open(plan.type === "webRTC" ? new FakeRTCTransport() : new FakeTransport());
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
