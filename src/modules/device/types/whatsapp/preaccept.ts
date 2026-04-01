import type { CallPacketModel } from "./packet";

interface BaseContentAttrs {
    from: string;
    id: string;
    t: string;
}

interface PreacceptContentAttrs {
    "call-id": string;
    "call-creator": string;
}

interface AudioContent {
    tag: "audio";
    attrs: {
        enc: "opus";
        rate: 16000;
    };
}

interface EncoptContent {
    tag: "encopt";
    attrs: {
        keygen: "2";
    };
}

interface CapabilityContent {
    tag: "capability";
    attrs: {
        ver: "1";
    };
    content: {
        type: "Buffer";
        data: number[];
    };
}

export interface PreacceptContent {
    tag: "preaccept";
    attrs: PreacceptContentAttrs;
    content: [AudioContent, EncoptContent, CapabilityContent];
}

export interface PreacceptPacket extends CallPacketModel<BaseContentAttrs, PreacceptContent> {}
