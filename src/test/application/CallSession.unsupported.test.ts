import { CallSession } from "@/application/call/CallSession";
import { FakeCallSignaling } from "@/test/fakes/FakeCallSignaling";
import { FakeTransportFactory } from "@/test/fakes/FakeTransportFactory";
import { describe, expect, it } from "vitest";

/**
 * Uma plataforma que não carrega um tipo de chamada diz isso na hora de abrir, com código, e
 * não com exceção no meio da negociação. É o que o runtime do React Native precisa: ele não
 * tem socket binário, então a chamada não oficial tem de ser recusada de cara.
 */
describe("starting a call the platform cannot carry", () => {
    it("fails with CALL_TYPE_UNSUPPORTED, naming the type", async () => {
        const transports = new FakeTransportFactory();
        transports.unsupported.add("UNOFFICIAL");

        const started = await CallSession.Start(
            { signaling: new FakeCallSignaling(), transports, setLocalMuted: () => {} },
            { to: "5511999999999", type: "UNOFFICIAL", deviceToken: "device-token" },
        );

        expect(started.data).toBeNull();
        expect(started.error?.code).toBe("CALL_TYPE_UNSUPPORTED");
        expect(started.error?.details).toEqual({ type: "UNOFFICIAL" });
    });

    it("does not build any transport before refusing", async () => {
        const transports = new FakeTransportFactory();
        transports.unsupported.add("OFFICIAL");

        await CallSession.Start(
            { signaling: new FakeCallSignaling(), transports, setLocalMuted: () => {} },
            { to: "5511999999999", type: "OFFICIAL", deviceToken: "device-token" },
        );

        expect(transports.opened).toHaveLength(0);
    });

    it("still carries the type it does support", async () => {
        const transports = new FakeTransportFactory();
        transports.unsupported.add("UNOFFICIAL");

        const started = await CallSession.Start(
            { signaling: new FakeCallSignaling(), transports, setLocalMuted: () => {} },
            { to: "5511999999999", type: "OFFICIAL", deviceToken: "device-token" },
        );

        expect(started.error?.code).not.toBe("CALL_TYPE_UNSUPPORTED");
    });
});
