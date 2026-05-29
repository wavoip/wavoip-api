import { runStunProbe } from "@/modules/media/StunProbe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMockPeerConnection } from "./ice-test-helpers";

describe("runStunProbe", () => {
    const pcFactory = buildMockPeerConnection();

    beforeEach(() => {
        pcFactory.reset();
        vi.stubGlobal("RTCPeerConnection", pcFactory.MockRTCPeerConnection);
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it("returns reachable=true when an srflx candidate is gathered before the timeout", async () => {
        const probe = runStunProbe(["stun:server-a.example:3478"], 1000);

        await vi.advanceTimersByTimeAsync(10);
        pcFactory.instances[0]._fireIceCandidate("srflx");
        await vi.advanceTimersByTimeAsync(10);

        const results = await probe;
        expect(results).toHaveLength(1);
        expect(results[0].server).toBe("stun:server-a.example:3478");
        expect(results[0].reachable).toBe(true);
        expect(results[0].latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("returns reachable=false when no srflx candidate arrives before the timeout", async () => {
        const probe = runStunProbe(["stun:dead.example:3478"], 500);

        await vi.advanceTimersByTimeAsync(600);

        const results = await probe;
        expect(results[0].reachable).toBe(false);
        expect(results[0].latencyMs).toBeUndefined();
    });

    it("probes every server in parallel and returns a result per server", async () => {
        const probe = runStunProbe(["stun:a.example:3478", "stun:b.example:3478", "stun:c.example:3478"], 1000);

        await vi.advanceTimersByTimeAsync(10);
        expect(pcFactory.instances).toHaveLength(3);
        pcFactory.instances[0]._fireIceCandidate("srflx");
        pcFactory.instances[2]._fireIceCandidate("srflx");
        await vi.advanceTimersByTimeAsync(1100);

        const results = await probe;
        expect(results.map((r) => r.server)).toEqual([
            "stun:a.example:3478",
            "stun:b.example:3478",
            "stun:c.example:3478",
        ]);
        expect(results[0].reachable).toBe(true);
        expect(results[1].reachable).toBe(false);
        expect(results[2].reachable).toBe(true);
    });

    it("closes every RTCPeerConnection after the probe finishes", async () => {
        const probe = runStunProbe(["stun:a.example:3478", "stun:b.example:3478"], 300);

        await vi.advanceTimersByTimeAsync(400);
        await probe;

        for (const pc of pcFactory.instances) {
            expect(pc.close).toHaveBeenCalled();
        }
    });

    it("uses a default timeout when none is provided", async () => {
        const probe = runStunProbe(["stun:a.example:3478"]);

        await vi.advanceTimersByTimeAsync(5000);
        const results = await probe;
        expect(results).toHaveLength(1);
    });
});
