import type { ConnectivityIssue, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import { WebRTCTransport } from "@/modules/media/WebRTC";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockAudio, buildMockPeerConnection, makeMockMediaManager } from "./ice-test-helpers";

describe("WebRTCTransport ICE diagnostics", () => {
    const pcFactory = buildMockPeerConnection();

    beforeEach(() => {
        pcFactory.reset();
        vi.stubGlobal("RTCPeerConnection", pcFactory.MockRTCPeerConnection);
        vi.stubGlobal("Audio", MockAudio);
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    describe("candidate counting", () => {
        it("counts candidates by type from onicecandidate events", async () => {
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never);

            const diagPromise = new Promise<IceDiagnostics>((resolve) => {
                transport.on("iceDiagnostics", resolve);
            });

            const offerPromise = transport.createOffer();
            const pc = pcFactory.last();
            pc._fireIceCandidate("host");
            pc._fireIceCandidate("host");
            pc._fireIceCandidate("srflx");
            await vi.advanceTimersByTimeAsync(5);
            pc._completeGathering();
            await offerPromise;

            const diag = await diagPromise;
            expect(diag.candidatesByType.host).toBe(2);
            expect(diag.candidatesByType.srflx).toBe(1);
            expect(diag.candidatesByType.relay).toBe(0);
            expect(diag.candidatesByType.prflx).toBe(0);
        });
    });

    describe("iceDiagnostics event", () => {
        it("emits with gatheringTimedOut=false when gathering completes in time", async () => {
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never);

            const cb = vi.fn();
            transport.on("iceDiagnostics", cb);

            const offerPromise = transport.createOffer();
            const pc = pcFactory.last();
            pc._fireIceCandidate("srflx");
            await vi.advanceTimersByTimeAsync(5);
            pc._completeGathering();
            await offerPromise;

            expect(cb).toHaveBeenCalledTimes(1);
            const diag = cb.mock.calls[0][0] as IceDiagnostics;
            expect(diag.gatheringTimedOut).toBe(false);
            expect(diag.stunReached).toBe(true);
            expect(diag.turnReached).toBe(false);
            expect(diag.gatheringDurationMs).toBeGreaterThanOrEqual(0);
        });

        it("emits with gatheringTimedOut=true when the timeout fires first", async () => {
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never, undefined, { iceConfig: { gatheringTimeoutMs: 200 } });

            const cb = vi.fn();
            transport.on("iceDiagnostics", cb);

            const offerPromise = transport.createOffer();
            pcFactory.last()._fireIceCandidate("host");
            await vi.advanceTimersByTimeAsync(300);
            await offerPromise;

            expect(cb).toHaveBeenCalledTimes(1);
            const diag = cb.mock.calls[0][0] as IceDiagnostics;
            expect(diag.gatheringTimedOut).toBe(true);
            expect(diag.stunReached).toBe(false);
        });

        it("sets turnReached=true when a relay candidate is gathered", async () => {
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never);

            const cb = vi.fn();
            transport.on("iceDiagnostics", cb);

            const offerPromise = transport.createOffer();
            const pc = pcFactory.last();
            pc._fireIceCandidate("relay");
            await vi.advanceTimersByTimeAsync(5);
            pc._completeGathering();
            await offerPromise;

            const diag = cb.mock.calls[0][0] as IceDiagnostics;
            expect(diag.turnReached).toBe(true);
        });
    });

    describe("connectivityIssue event", () => {
        it("emits STUN_UNREACHABLE when gathering times out without an srflx candidate", async () => {
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never, undefined, { iceConfig: { gatheringTimeoutMs: 200 } });

            const issues: ConnectivityIssue[] = [];
            transport.on("connectivityIssue", (i) => issues.push(i));

            const offerPromise = transport.createOffer();
            pcFactory.last()._fireIceCandidate("host");
            await vi.advanceTimersByTimeAsync(300);
            await offerPromise;

            expect(issues).toContain("STUN_UNREACHABLE");
        });

        it("does not emit STUN_UNREACHABLE when an srflx candidate is gathered before timeout", async () => {
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never, undefined, { iceConfig: { gatheringTimeoutMs: 200 } });

            const issues: ConnectivityIssue[] = [];
            transport.on("connectivityIssue", (i) => issues.push(i));

            const offerPromise = transport.createOffer();
            const pc = pcFactory.last();
            pc._fireIceCandidate("host");
            pc._fireIceCandidate("srflx");
            await vi.advanceTimersByTimeAsync(50);
            pc._completeGathering();
            await offerPromise;

            expect(issues).not.toContain("STUN_UNREACHABLE");
        });

        it("emits NO_HOST_CANDIDATES when gathering ends without a host candidate", async () => {
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never);

            const issues: ConnectivityIssue[] = [];
            transport.on("connectivityIssue", (i) => issues.push(i));

            const offerPromise = transport.createOffer();
            const pc = pcFactory.last();
            pc._fireIceCandidate("srflx");
            await vi.advanceTimersByTimeAsync(5);
            pc._completeGathering();
            await offerPromise;

            expect(issues).toContain("NO_HOST_CANDIDATES");
        });

        it("emits ICE_CONNECTION_FAILED when iceConnectionState transitions to failed", async () => {
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never);

            const issues: ConnectivityIssue[] = [];
            transport.on("connectivityIssue", (i) => issues.push(i));

            const offerPromise = transport.createOffer();
            const pc = pcFactory.last();
            await vi.advanceTimersByTimeAsync(5);
            pc._completeGathering();
            await offerPromise;

            pc._fireIceConnectionState("failed");
            expect(issues).toContain("ICE_CONNECTION_FAILED");
        });

        it("does not emit duplicates for the same issue", async () => {
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never);

            const issues: ConnectivityIssue[] = [];
            transport.on("connectivityIssue", (i) => issues.push(i));

            const offerPromise = transport.createOffer();
            const pc = pcFactory.last();
            await vi.advanceTimersByTimeAsync(5);
            pc._completeGathering();
            await offerPromise;

            pc._fireIceConnectionState("failed");
            pc._fireIceConnectionState("failed");

            expect(issues.filter((i) => i === "ICE_CONNECTION_FAILED")).toHaveLength(1);
        });
    });
});
