import { WebRTCTransport } from "@/modules/media/WebRTC";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockAudio, buildMockPeerConnection, makeMockMediaManager } from "./ice-test-helpers";

describe("WebRTCTransport ICE server config", () => {
    const pcFactory = buildMockPeerConnection();

    beforeEach(() => {
        pcFactory.reset();
        vi.stubGlobal("RTCPeerConnection", pcFactory.MockRTCPeerConnection);
        vi.stubGlobal("Audio", MockAudio);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("uses multiple default STUN servers when no iceServers configured", () => {
        const mm = makeMockMediaManager();
        new WebRTCTransport(mm as never);

        const config = pcFactory.last()._config;
        expect(config.iceServers).toBeDefined();
        const servers = config.iceServers ?? [];
        const urls = servers
            .flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]))
            .filter((u): u is string => typeof u === "string");
        expect(urls.length).toBeGreaterThanOrEqual(2);
        expect(urls.every((u) => u.startsWith("stun:"))).toBe(true);
    });

    it("uses iceServers from config when provided", () => {
        const mm = makeMockMediaManager();
        const custom: RTCIceServer[] = [
            { urls: "stun:my-stun.example.com:3478" },
            { urls: ["turn:my-turn.example.com:3478"], username: "u", credential: "c" },
        ];
        new WebRTCTransport(mm as never, undefined, { iceServers: custom });

        expect(pcFactory.last()._config.iceServers).toEqual(custom);
    });
});
