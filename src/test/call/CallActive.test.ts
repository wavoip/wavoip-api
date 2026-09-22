import type { CallSession } from "@/application/call/CallSession";
import type { CallActive } from "@/modules/call/CallActive";
import { OfferProxy } from "@/modules/call/Offer";
import { _resetDeprecationWarnings } from "@/modules/shared/deprecation";
import { CallHarness, relayPlan, testPeer, webRTCPlan } from "@/test/support/CallHarness";
import { beforeEach, describe, expect, it, vi } from "vitest";

let harness: CallHarness;

beforeEach(() => {
    harness = new CallHarness();
    _resetDeprecationWarnings();
});

async function makeActive(plan = relayPlan): Promise<{ session: CallSession; active: CallActive }> {
    const type = plan === relayPlan ? "UNOFFICIAL" : "OFFICIAL";
    const session = harness.incoming({ type, plan });
    const { call } = await OfferProxy(session, vi.fn()).accept();
    if (!call) throw new Error("accept failed");
    return { session, active: call };
}

const serverStats = {
    rtt: { client: { min: 10, max: 30, avg: 20 }, whatsapp: { min: 100, max: 300, avg: 200 } },
    tx: { total: 50, total_bytes: 5000, loss: 1 },
    rx: { total: 40, total_bytes: 4000, loss: 2 },
};

describe("CallActive — getters", () => {
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

    it("connectionStatus follows the transport", async () => {
        const { active } = await makeActive();

        harness.transports.current.status = "reconnecting";

        expect(active.connectionStatus).toBe("reconnecting");
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

describe("CallActive — commands", () => {
    it("mute and unmute apply at once, without asking the server", async () => {
        const { active } = await makeActive();
        harness.signaling.sent.length = 0;

        expect(await active.mute()).toEqual({ err: null });
        expect(await active.unmute()).toEqual({ err: null });

        expect(harness.muted).toEqual([true, false]);
        expect(harness.signaling.sent).toEqual([]);
    });

    it("end tells the server and stops the media, once", async () => {
        const { active } = await makeActive();
        harness.signaling.sent.length = 0;

        expect(await active.end()).toEqual({ err: null });
        expect(await active.end()).toEqual({ err: null });

        expect(harness.signaling.sent.map((s) => s.command)).toEqual(["end"]);
        expect(harness.transports.current.stops).toBe(1);
    });

    it("getStats merges the server's numbers into what the client measured", async () => {
        const { active, session } = await makeActive();

        harness.fromServer(session, { type: "stats", stats: serverStats });

        expect((await active.getStats()).rtt).toEqual({ min: 10, max: 30, avg: 20 });
    });
});

describe("CallActive — what the server says", () => {
    it("turns the failure reason into the error event", async () => {
        const { active, session } = await makeActive();
        const heard = vi.fn();
        active.on("error", heard);

        harness.fromServer(session, { type: "failed", reason: "CONNECTION_TIMEOUT" });

        expect(heard).toHaveBeenCalledWith("CONNECTION_TIMEOUT");
    });

    it("splits the peer's mute into two events", async () => {
        const { active, session } = await makeActive();
        const muted = vi.fn();
        const unmuted = vi.fn();
        active.on("peerMute", muted);
        active.on("peerUnmute", unmuted);

        harness.fromServer(session, { type: "peerMuted", muted: true }, { type: "peerMuted", muted: false });

        expect(muted).toHaveBeenCalledOnce();
        expect(unmuted).toHaveBeenCalledOnce();
    });

    it("announces the outcome before ended", async () => {
        const { active, session } = await makeActive();
        const seen: string[] = [];
        active.on("status", (status) => seen.push(`status:${status}`));
        active.on("ended", () => seen.push(`ended:${active.status}`));

        harness.fromServer(session, { type: "ended", status: "ENDED" });

        expect(seen).toEqual(["status:ENDED", "ended:ENDED"]);
    });

    it("reports the server's stats as they arrive", async () => {
        const { active, session } = await makeActive();
        const heard = vi.fn();
        active.on("serverStats", heard);

        harness.fromServer(session, { type: "stats", stats: serverStats });

        expect(heard).toHaveBeenCalledWith(serverStats);
    });
});

describe("CallActive — media reports", () => {
    it("forwards the transport's connection status", async () => {
        const { active } = await makeActive();
        const heard = vi.fn();
        active.on("connectionStatus", heard);

        harness.transports.current.emit("statusChanged", "reconnecting");

        expect(heard).toHaveBeenCalledWith("reconnecting");
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

describe("CallActive — deprecated surface", () => {
    it("warns once per deprecated member", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const { active } = await makeActive();

        void active.device_token;
        void active.device_token;
        void active.connection_status;
        active.onEnd(vi.fn());
        active.on("stats", vi.fn());

        const warned = warn.mock.calls.map((c) => String(c[0]));
        expect(warned.filter((m) => m.includes("CallActive.device_token"))).toHaveLength(1);
        expect(warned.filter((m) => m.includes("CallActive.connection_status"))).toHaveLength(1);
        expect(warned.filter((m) => m.includes("CallActive.onEnd"))).toHaveLength(1);
        expect(warned.filter((m) => m.includes("CallActive.stats event"))).toHaveLength(1);
        warn.mockRestore();
    });

    it("does not warn about the stats event on its own", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        await makeActive();

        expect(warn.mock.calls.filter((c) => String(c[0]).includes("stats event"))).toHaveLength(0);
        warn.mockRestore();
    });
});
