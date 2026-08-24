import { describe, expect, it } from "vitest";
import { toPeer } from "@/modules/call/Peer";
import type { CallPeer } from "@/modules/call/Peer";

/**
 * `CallPeer` is a public export, so anything a consumer builds with it has to keep compiling
 * across releases. Adding `username` as a REQUIRED field would have broken every test double
 * and fixture in every consumer — these are compile-time guards with a runtime assertion
 * attached, so the type regression fails the suite rather than only downstream builds.
 */
describe("CallPeer backward compatibility", () => {
    it("still accepts a peer literal written before username existed", () => {
        const legacy: CallPeer = {
            phone: "5511999999999",
            displayName: "Maria",
            profilePicture: null,
            muted: false,
        };

        expect(legacy.username).toBeUndefined();
    });

    // The type is loose so old code compiles; the runtime is not. Every peer this library
    // hands out has been through toPeer, so a reader never has to tell absent from null.
    it("always sets the field on a peer the library produces", () => {
        const peer = toPeer({ phone: "5511999999999", displayName: "Maria", profilePicture: null });

        expect("username" in peer).toBe(true);
        expect(peer.username).toBeNull();
    });
});
