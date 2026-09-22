import type { TransportFactory } from "@/application/call/CallSession";
import type { MediaPlan } from "@/domain/call/types";
import type { IRTCTransport, ITransport } from "@/modules/media/ITransport";
import { FakeRTCTransport, FakeTransport } from "@/test/fakes/FakeTransport";

/** Guarda o que foi aberto, para o teste ver qual transporte a sessão usou em cada passo. */
export class FakeTransportFactory implements TransportFactory {
    readonly opened: (FakeTransport | FakeRTCTransport)[] = [];
    readonly plans: MediaPlan[] = [];

    offerer(): IRTCTransport {
        return this.open(new FakeRTCTransport());
    }

    forPlan(plan: MediaPlan, _deviceToken: string): ITransport {
        this.plans.push(plan);
        return this.open(plan.type === "webRTC" ? new FakeRTCTransport() : new FakeTransport());
    }

    /** O último aberto é o que a sessão está usando agora. */
    get current(): FakeTransport | FakeRTCTransport {
        return this.opened[this.opened.length - 1];
    }

    private open<T extends FakeTransport | FakeRTCTransport>(transport: T): T {
        this.opened.push(transport);
        return transport;
    }
}
