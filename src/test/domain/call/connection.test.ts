import { Connection } from "@/domain/call/connection";
import type { CallStatus, TransportStatus } from "@/domain/call/types";
import { describe, expect, it } from "vitest";

describe("Connection.merge", () => {
    it.each<[TransportStatus, CallStatus, string]>([
        ["connected", "ACTIVE", "connected"],
        ["connecting", "ACTIVE", "reconnecting"],
        ["reconnecting", "ACTIVE", "reconnecting"],
        // A mídia local está de pé, mas o WhatsApp parou de passar áudio.
        ["connected", "DISCONNECTED", "reconnecting"],
        // O transporte caiu de vez: a chamada está perdida, não reconectando.
        ["disconnected", "ACTIVE", "disconnected"],
        ["disconnected", "DISCONNECTED", "disconnected"],
    ])("reads %s transport with the call %s as %s", (transport, status, expected) => {
        expect(Connection.merge(transport, status)).toBe(expected);
    });
});
