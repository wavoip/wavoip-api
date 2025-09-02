import type { CallPacketModel } from "./packet";

interface BaseContentAttrs {
    from: string;
    version: "2.24.12.78";
    platform: "iphone";
    id: "1720566065-1076";
    sender_lid: "181196130619586@lid";
    notify: "Leonardo Amaro";
    e: string;
    t: string;
}

interface OfferContentAttrs {
    "call-id": string;
    "call-creator": string;
    joinable: "1";
}

export interface OfferContent {
    tag: "offer";
    attrs: OfferContentAttrs;
    content: unknown[];
}

export interface OfferPacket
    extends CallPacketModel<BaseContentAttrs, OfferContent> {}
