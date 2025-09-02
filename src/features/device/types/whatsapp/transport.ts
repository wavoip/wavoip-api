interface TransportContentAttrs {
    "call-id": string;
    "call-creator": string;
    "transport-message-type": string;
}

interface RelayPriorityContent<Priority> {
    tag: "te";
    attrs: {
        priority: Priority;
    };
    content: Buffer;
}

interface NetContent {
    tag: "net";
    attrs: {
        protocol: "0";
        medium: "2";
    };
    content: [];
}

interface RTEContent {
    tag: "rte";
    attrs: object;
    content: Buffer;
}

export interface TransportContent {
    tag: "transport";
    attrs: TransportContentAttrs;
    content: [
        RelayPriorityContent<"2">,
        RelayPriorityContent<"1">,
        NetContent,
        RTEContent,
    ];
}
