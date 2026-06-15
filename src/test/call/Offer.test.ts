import type { CallActive } from "@/modules/call/CallActive";
import { OfferProxy } from "@/modules/call/Offer";
import { Call } from "@/modules/device/Call";
import { describe, expect, it, vi } from "vitest";

const peer = { phone: "5511999999999", displayName: "Test", profilePicture: null };

function makeCall() {
    return Call.CreateOffer("call-1", "OFFICIAL", peer, "device-token");
}

describe("Offer", () => {
    describe("getters", () => {
        it("id proxies to call.id", () => {
            const call = makeCall();
            
            const offer = OfferProxy(call, { onAccept: vi.fn(), onReject: vi.fn() });
            expect(offer.id).toBe("call-1");
        });

        it("type proxies to call.type", () => {
            const call = makeCall();
            
            const offer = OfferProxy(call, { onAccept: vi.fn(), onReject: vi.fn() });
            expect(offer.type).toBe("OFFICIAL");
        });

        it("direction proxies to call.direction", () => {
            const call = makeCall();
            
            const offer = OfferProxy(call, { onAccept: vi.fn(), onReject: vi.fn() });
            expect(offer.direction).toBe("INCOMING");
        });

        it("device_token proxies to call.deviceToken", () => {
            const call = makeCall();
            
            const offer = OfferProxy(call, { onAccept: vi.fn(), onReject: vi.fn() });
            expect(offer.device_token).toBe("device-token");
        });

        it("status proxies to call.status", () => {
            const call = makeCall();
            
            const offer = OfferProxy(call, { onAccept: vi.fn(), onReject: vi.fn() });
            expect(offer.status).toBe("CALLING");
        });

        it("peer spreads call.peer and adds muted: false", () => {
            const call = makeCall();
            
            const offer = OfferProxy(call, { onAccept: vi.fn(), onReject: vi.fn() });
            expect(offer.peer).toEqual({ ...peer, muted: false });
        });
    });

    describe("accept()", () => {
        it("calls onAccept with call and returns { call: active, err: null } on success", async () => {
            const call = makeCall();
            
            const mockActive = {} as CallActive;
            const onAccept = vi.fn().mockResolvedValue(mockActive);
            const offer = OfferProxy(call, { onAccept, onReject: vi.fn() });

            const result = await offer.accept();

            expect(onAccept).toHaveBeenCalledWith(call);
            expect(result).toEqual({ call: mockActive, err: null });
        });

        it("returns { call: null, err: string } when onAccept throws", async () => {
            const call = makeCall();
            
            const onAccept = vi.fn().mockRejectedValue(Error("WebRTC failed"));
            const offer = OfferProxy(call, { onAccept, onReject: vi.fn() });

            const result = await offer.accept();

            expect(result).toEqual({ call: null, err: "Error: WebRTC failed" });
        });

        it("returns { call: null, err: string } when onAccept throws a string", async () => {
            const call = makeCall();
            
            const onAccept = vi.fn().mockRejectedValue("something went wrong");
            const offer = OfferProxy(call, { onAccept, onReject: vi.fn() });

            const result = await offer.accept();

            expect(result.err).toBe("something went wrong");
            expect(result.call).toBeNull();
        });
    });

    describe("reject()", () => {
        it("calls onReject with call and returns { err: null }", async () => {
            const call = makeCall();
            
            const onReject = vi.fn();
            const offer = OfferProxy(call, { onAccept: vi.fn(), onReject });

            const result = await offer.reject();

            expect(onReject).toHaveBeenCalledWith(call);
            expect(result).toEqual({ err: null });
        });
    });

    describe("event subscriptions", () => {
        it("onAcceptedElsewhere fires when bus emits 'accepted'", () => {
            const call = makeCall();
            
            const offer = OfferProxy(call, { onAccept: vi.fn(), onReject: vi.fn() });
            const cb = vi.fn();
            offer.onAcceptedElsewhere(cb);

            call.emit("accepted");

            expect(cb).toHaveBeenCalledOnce();
        });

        it("onRejectedElsewhere fires when bus emits 'rejected'", () => {
            const call = makeCall();
            
            const offer = OfferProxy(call, { onAccept: vi.fn(), onReject: vi.fn() });
            const cb = vi.fn();
            offer.onRejectedElsewhere(cb);

            call.emit("rejected");

            expect(cb).toHaveBeenCalledOnce();
        });

        it("onUnanswered fires when bus emits 'unanswered'", () => {
            const call = makeCall();
            
            const offer = OfferProxy(call, { onAccept: vi.fn(), onReject: vi.fn() });
            const cb = vi.fn();
            offer.onUnanswered(cb);

            call.emit("unanswered");

            expect(cb).toHaveBeenCalledOnce();
        });

        it("onEnd fires when bus emits 'ended'", () => {
            const call = makeCall();
            
            const offer = OfferProxy(call, { onAccept: vi.fn(), onReject: vi.fn() });
            const cb = vi.fn();
            offer.onEnd(cb);

            call.emit("ended");

            expect(cb).toHaveBeenCalledOnce();
        });

        it("onStatus fires with status value when bus emits 'status'", () => {
            const call = makeCall();
            
            const offer = OfferProxy(call, { onAccept: vi.fn(), onReject: vi.fn() });
            const cb = vi.fn();
            offer.onStatus(cb);

            call.emit("status", "ACTIVE");

            expect(cb).toHaveBeenCalledWith("ACTIVE");
        });
    });
});
