import type { Peer } from "@/domain/call/types";

export type CallPeer = Peer & {
    muted: boolean;
};
