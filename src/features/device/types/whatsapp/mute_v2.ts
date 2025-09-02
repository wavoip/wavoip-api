interface MuteV2ContentAttrs {
    "call-id": string;
    "call-creator": string;
    "mute-state": "0" | "1";
}

export interface MuteV2Content {
    tag: "mute_v2";
    attrs: MuteV2ContentAttrs;
    content: [];
}
