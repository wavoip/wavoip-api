import type { CallPacketModel } from "./packet";

interface BaseContentAttrs {
    from: string;
    id: string;
    t: string;
}

interface RelayLatencyContentAttrs {
    "call-id": string;
    "call-creator": string;
}

interface RelayContent {
    tag: "te";
    attrs: {
        latency: string;
    };
    content: Buffer;
}

export interface RelayLatencyContent {
    tag: "relaylatency";
    attrs: RelayLatencyContentAttrs;
    content: [RelayContent];
}

export interface RelayLatencyPacket extends CallPacketModel<BaseContentAttrs, RelayLatencyContent> {}
