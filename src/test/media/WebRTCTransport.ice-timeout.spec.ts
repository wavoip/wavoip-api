import { WebRTCTransport } from "@/modules/media/webrtc/Transport";
import { FakeAudioRuntime } from "@/test/fakes/FakeAudioRuntime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMockPeerConnection } from "./ice-test-helpers";

describe("WebRTCTransport ICE gathering timeout", () => {
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

    describe("createOffer (outgoing)", () => {
        it("resolves immediately when gathering completes before the timeout", async () => {
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio);

            const offerPromise = transport.createOffer();

            await vi.advanceTimersByTimeAsync(10);
            pcFactory.last()._completeGathering();

            const sdp = await offerPromise;
            expect(sdp).toBe("mock-answer-sdp");
        });

        it("resolves at the configured timeout when gathering never completes", async () => {
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio, undefined, { iceConfig: { gatheringTimeoutMs: 800 } });

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
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio);

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
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio);

            const offerPromise = transport.createOffer();
            await vi.advanceTimersByTimeAsync(5);
            pcFactory.last()._completeGathering();
            await offerPromise;

            const { added, removed } = pcFactory.last()._iceListenerCounts;
            expect(added).toBeGreaterThan(0);
            expect(removed).toBe(added);
        });

        it("removes the icegatheringstatechange listener after timing out", async () => {
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio, undefined, { iceConfig: { gatheringTimeoutMs: 500 } });

            const offerPromise = transport.createOffer();
            await vi.advanceTimersByTimeAsync(600);
            await offerPromise;

            const { added, removed } = pcFactory.last()._iceListenerCounts;
            expect(added).toBeGreaterThan(0);
            expect(removed).toBe(added);
        });

        it("returns immediately when gathering is already complete before waitForIceGathering attaches", async () => {
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio);
            pcFactory.last().iceGatheringState = "complete";

            const sdp = await transport.createOffer();
            expect(sdp).toBe("mock-answer-sdp");
        });
    });

    describe("accept (incoming) honors the same timeout cap", () => {
        it("resolves the answer at the configured timeout when gathering hangs", async () => {
            const audio = new FakeAudioRuntime();
            const transport = new WebRTCTransport(audio, "offer-sdp", { iceConfig: { gatheringTimeoutMs: 400 } });

            const accepting = transport.accept();

            await vi.advanceTimersByTimeAsync(500);

            expect(await accepting).toEqual({ type: "webRTC", sdp: "mock-answer-sdp" });
        });
    });
});
