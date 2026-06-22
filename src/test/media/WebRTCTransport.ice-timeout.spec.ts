import { WebRTCTransport } from "@/modules/media/WebRTC";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockAudio, buildMockPeerConnection, makeMockMediaManager } from "./ice-test-helpers";

describe("WebRTCTransport ICE gathering timeout", () => {
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

    describe("createOffer (outgoing)", () => {
        it("resolves immediately when gathering completes before the timeout", async () => {
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never);

            const offerPromise = transport.createOffer();

            await vi.advanceTimersByTimeAsync(10);
            pcFactory.last()._completeGathering();

            const sdp = await offerPromise;
            expect(sdp).toBe("mock-answer-sdp");
        });

        it("resolves at the configured timeout when gathering never completes", async () => {
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never, undefined, { iceConfig: { gatheringTimeoutMs: 800 } });

            const offerPromise = transport.createOffer();

            await vi.advanceTimersByTimeAsync(799);
            let settled = false;
            offerPromise.then(() => {
                settled = true;
            });
            await Promise.resolve();
            expect(settled).toBe(false);

            await vi.advanceTimersByTimeAsync(2);
            await offerPromise;
            expect(settled).toBe(true);
        });

        it("uses the 2500ms default timeout when none is configured", async () => {
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never);

            const offerPromise = transport.createOffer();

            await vi.advanceTimersByTimeAsync(2499);
            let settled = false;
            offerPromise.then(() => {
                settled = true;
            });
            await Promise.resolve();
            expect(settled).toBe(false);

            await vi.advanceTimersByTimeAsync(2);
            await offerPromise;
            expect(settled).toBe(true);
        });

        it("removes the icegatheringstatechange listener after resolving on completion", async () => {
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never);

            const offerPromise = transport.createOffer();
            await vi.advanceTimersByTimeAsync(5);
            pcFactory.last()._completeGathering();
            await offerPromise;

            const { added, removed } = pcFactory.last()._iceListenerCounts;
            expect(added).toBeGreaterThan(0);
            expect(removed).toBe(added);
        });

        it("removes the icegatheringstatechange listener after timing out", async () => {
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never, undefined, { iceConfig: { gatheringTimeoutMs: 500 } });

            const offerPromise = transport.createOffer();
            await vi.advanceTimersByTimeAsync(600);
            await offerPromise;

            const { added, removed } = pcFactory.last()._iceListenerCounts;
            expect(added).toBeGreaterThan(0);
            expect(removed).toBe(added);
        });

        it("returns immediately when gathering is already complete before waitForIceGathering attaches", async () => {
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never);
            pcFactory.last().iceGatheringState = "complete";

            const sdp = await transport.createOffer();
            expect(sdp).toBe("mock-answer-sdp");
        });
    });

    describe("start (incoming) honors the same timeout cap", () => {
        it("resolves the answer at the configured timeout when gathering hangs", async () => {
            const mm = makeMockMediaManager();
            const transport = new WebRTCTransport(mm as never, "offer-sdp", { iceConfig: { gatheringTimeoutMs: 400 } });

            const startPromise = transport.start();

            await vi.advanceTimersByTimeAsync(500);
            await startPromise;

            const answer = await transport.answer;
            expect(answer.sdp).toBe("mock-answer-sdp");
        });
    });
});
