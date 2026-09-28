import { IceCandidates } from "@/domain/call/ice";
import { describe, expect, it } from "vitest";

/**
 * O `RTCIceCandidate` do `react-native-webrtc` não tem `.type` — só `candidate`, `sdpMid` e
 * `sdpMLineIndex`. Contar pelo `.type` zerava a conta inteira no celular, e o diagnóstico
 * acusava `NO_HOST_CANDIDATES` e `STUN_UNREACHABLE` num aparelho saudável.
 */
describe("IceCandidates.kindOf", () => {
    const line = (typ: string) =>
        `candidate:842163049 1 udp 1677729535 200.1.2.3 54321 typ ${typ} raddr 0.0.0.0 rport 0`;

    it("reads the kind from the SDP line when the platform omits the property", () => {
        expect(IceCandidates.kindOf({ candidate: line("host") })).toBe("host");
        expect(IceCandidates.kindOf({ candidate: line("srflx") })).toBe("srflx");
        expect(IceCandidates.kindOf({ candidate: line("relay") })).toBe("relay");
        expect(IceCandidates.kindOf({ candidate: line("prflx") })).toBe("prflx");
    });

    it("prefers the property where the platform does expose it", () => {
        expect(IceCandidates.kindOf({ type: "relay", candidate: line("host") })).toBe("relay");
    });

    it("answers null for what it cannot name, instead of guessing", () => {
        expect(IceCandidates.kindOf(null)).toBeNull();
        expect(IceCandidates.kindOf({ candidate: "" })).toBeNull();
        expect(IceCandidates.kindOf({ candidate: "candidate:1 1 udp 1 1.2.3.4 1 typ inventado" })).toBeNull();
        expect(IceCandidates.kindOf({ type: null, candidate: null })).toBeNull();
    });

    /** O fim da coleta chega como um candidato nulo, e não é erro nenhum. */
    it("does not mistake the end of gathering for a candidate", () => {
        expect(IceCandidates.kindOf(null)).toBeNull();
    });
});
