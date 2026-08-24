import type { Peer } from "@/modules/device/Call";

export type CallPeer = Peer & {
    muted: boolean;
};

/**
 * A peer exactly as the device sends it. `username` is absent from older devices, so it is
 * optional on the wire and normalized to `null` on the way in — consumers of {@link Peer}
 * never see `undefined`.
 */
export type WireCallPeer = Omit<CallPeer, "username" | "muted"> & { username?: string | null };

/**
 * Normalizes a peer off the wire. A device that does not report a username at all is not
 * saying the call went out by one, so the absence collapses to `null`.
 *
 * @example toPeer({ phone: "5511999999999", displayName: null, profilePicture: null })
 */
export function toPeer(wire: WireCallPeer): Peer {
    return {
        phone: wire.phone,
        displayName: wire.displayName,
        profilePicture: wire.profilePicture,
        username: wire.username ?? null,
    };
}
