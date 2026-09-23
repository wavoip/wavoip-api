import type { CallSession } from "@/application/call/CallSession";
import type { ActiveCall } from "@/modules/call/ActiveCall";
import { IncomingCallProxy } from "@/modules/call/IncomingCall";
import { CallHarness, relayPlan, testPeer, webRTCPlan } from "@/test/support/CallHarness";
import { beforeEach, describe, expect, it, vi } from "vitest";

let harness: CallHarness;

beforeEach(() => {
    harness = new CallHarness();
});

async function makeActive(plan = relayPlan): Promise<{ session: CallSession; active: ActiveCall }> {
    const type = plan === relayPlan ? "UNOFFICIAL" : "OFFICIAL";
    const session = harness.incoming({ type, plan });
    const { data } = await IncomingCallProxy(session).accept();
    if (!data) throw new Error("accept failed");
    return { session, active: data };
}

const serverStats = {
    rtt: { client: { min: 10, max: 30, avg: 20 }, whatsapp: { min: 100, max: 300, avg: 200 } },
    tx: { total: 50, total_bytes: 5000, loss: 1 },
    rx: { total: 40, total_bytes: 4000, loss: 2 },
};

describe("ActiveCall — getters", () => {
    it("reads the call's identity from the session", async () => {
        const { active } = await makeActive();

        expect(active).toMatchObject({
            id: "call-1",
            type: "UNOFFICIAL",
            direction: "INCOMING",
            deviceToken: "device-token",
            status: "ACTIVE",
        });
        expect(active.peer).toEqual({ ...testPeer, muted: false });
    });

    it("connection follows the transport", async () => {
        const { active } = await makeActive();

        harness.transports.current.status = "reconnecting";

        expect(active.connection).toBe("reconnecting");
    });

    it("connection reads reconnecting while the WhatsApp leg is down", async () => {
        const { active, session } = await makeActive();

        harness.fromServer(session, { type: "disconnected" });

        expect(active.connection).toBe("reconnecting");
    });

    it("peer.muted follows the other side's microphone", async () => {
        const { active } = await makeActive();

        harness.transports.current.peerMuted = true;

        expect(active.peer.muted).toBe(true);
    });

    it("status follows the server", async () => {
        const { active, session } = await makeActive();

        harness.fromServer(session, { type: "disconnected" });

        expect(active.status).toBe("DISCONNECTED");
    });
});

describe("ActiveCall — commands", () => {
    it("mute and unmute tell the other side before cutting the microphone", async () => {
        const { active } = await makeActive();
        harness.signaling.sent.length = 0;

        expect(await active.mute()).toEqual({ data: undefined, error: null });
        expect(await active.unmute()).toEqual({ data: undefined, error: null });

        expect(harness.muted).toEqual([true, false]);
        expect(harness.signaling.sent.map((s) => s.command)).toEqual(["mute", "mute"]);
    });

    it("end tells the server and stops the media, once", async () => {
        const { active } = await makeActive();
        harness.signaling.sent.length = 0;

        expect(await active.end()).toEqual({ data: undefined, error: null });
        expect(await active.end()).toEqual({ data: undefined, error: null });

        expect(harness.signaling.sent.map((s) => s.command)).toEqual(["end"]);
        expect(harness.transports.current.stops).toBe(1);
    });

    it("does not report ended when the call was ended from here", async () => {
        const { active, session } = await makeActive();
        const ended = vi.fn();
        active.on("ended", ended);

        await active.end();
        harness.fromServer(session, { type: "ended", status: "ENDED" });

        expect(ended).not.toHaveBeenCalled();
        expect(active.status).toBe("ENDED");
    });

    it("getStats merges the server's numbers into what the client measured", async () => {
        const { active, session } = await makeActive();

        harness.fromServer(session, { type: "stats", stats: serverStats });

        expect((await active.getStats()).rtt).toEqual({ min: 10, max: 30, avg: 20 });
    });
});

describe("ActiveCall — what the server says", () => {
    it("turns the failure reason into the failed event", async () => {
        const { active, session } = await makeActive();
        const heard = vi.fn();
        active.on("failed", heard);

        harness.fromServer(session, { type: "failed", error: { code: "CONNECTION_TIMEOUT" } });

        expect(heard).toHaveBeenCalledWith({ code: "CONNECTION_TIMEOUT" });
    });

    it("reports the peer's mute on a single channel", async () => {
        const { active, session } = await makeActive();
        const heard = vi.fn();
        active.on("peerMuteChanged", heard);

        harness.fromServer(session, { type: "peerMuted", muted: true }, { type: "peerMuted", muted: false });

        expect(heard.mock.calls).toEqual([[true], [false]]);
    });

    it("has the status settled before ended fires", async () => {
        const { active, session } = await makeActive();
        let seenInListener: string | undefined;
        active.on("ended", () => {
            seenInListener = active.status;
        });

        harness.fromServer(session, { type: "ended", status: "ENDED" });

        expect(seenInListener).toBe("ENDED");
    });
});

describe("ActiveCall — media reports", () => {
    it("reports either leg dropping as one connection change", async () => {
        const { active, session } = await makeActive();
        const heard = vi.fn();
        active.on("connectionChanged", heard);

        harness.transports.current.changeStatus("reconnecting");
        // A perna do WhatsApp cai com o transporte já reconectando: o estado junto não
        // mudou, e um evento repetido só faria a interface piscar.
        harness.fromServer(session, { type: "disconnected" });

        expect(heard.mock.calls).toEqual([["reconnecting"]]);
    });

    it("reports the call as lost when the transport gives up", async () => {
        const { active } = await makeActive();
        const heard = vi.fn();
        active.on("connectionChanged", heard);

        harness.transports.current.changeStatus("disconnected");

        expect(heard).toHaveBeenCalledWith("disconnected");
    });

    it("replays the last diagnostics to a listener that subscribes late", async () => {
        const { active } = await makeActive(webRTCPlan);
        const diag = {
            gatheringDurationMs: 120,
            gatheringTimedOut: false,
            candidatesByType: { host: 1, srflx: 1, prflx: 0, relay: 0 },
            stunReached: true,
            turnReached: false,
        };
        harness.transports.current.emit("iceDiagnostics", diag);

        const heard = vi.fn();
        active.on("iceDiagnostics", heard);

        expect(heard).toHaveBeenCalledWith(diag);
    });
});
