import { Readiness } from "@/domain/diagnostics/readiness";
import type { DiagnosticCheck, DiagnosticCode } from "@/domain/diagnostics/types";
import { describe, expect, it } from "vitest";

const check = (code: DiagnosticCode): DiagnosticCheck => ({ code, severity: "failure" });

describe("Readiness.of", () => {
    it("clears both call types when nothing is broken", () => {
        const readiness = Readiness.of([{ code: "AUDIO_RUNNING", severity: "ok" }]);

        expect(readiness.OFFICIAL.ready).toBe(true);
        expect(readiness.UNOFFICIAL.ready).toBe(true);
    });

    it("blocks only the call type whose transport is missing", () => {
        const readiness = Readiness.of([check("WEBRTC_MISSING")]);

        expect(readiness.OFFICIAL).toEqual({ ready: false, blockedBy: ["WEBRTC_MISSING"] });
        expect(readiness.UNOFFICIAL.ready).toBe(true);
    });

    it("blocks both when the audio itself failed", () => {
        const readiness = Readiness.of([check("AUDIO_ENGINE_FAILED"), check("MICROPHONE_MISSING")]);

        expect(readiness.OFFICIAL.blockedBy).toEqual(["AUDIO_ENGINE_FAILED", "MICROPHONE_MISSING"]);
        expect(readiness.UNOFFICIAL.blockedBy).toEqual(["AUDIO_ENGINE_FAILED", "MICROPHONE_MISSING"]);
    });

    /** Sem STUN a chamada ainda sai por candidato local ou por TURN: é aviso, não impedimento. */
    it("does not fail the environment just because no STUN answered", () => {
        const readiness = Readiness.of([{ code: "STUN_UNREACHABLE", severity: "warning" }]);

        expect(readiness.OFFICIAL.ready).toBe(true);
        expect(readiness.UNOFFICIAL.ready).toBe(true);
    });

    /** O gesto que falta segura o som, mas não impede a chamada de abrir. */
    it("does not block on a pending user gesture", () => {
        const readiness = Readiness.of([{ code: "USER_GESTURE_REQUIRED", severity: "warning" }]);

        expect(readiness.OFFICIAL.ready).toBe(true);
    });
});
