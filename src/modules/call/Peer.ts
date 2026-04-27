import type { Peer } from "@/modules/device/Call";

export type CallPeer = Peer & {
    muted: boolean;
};
