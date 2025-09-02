interface BaseContent<T> {
    tag: string;
    attrs: T;
    content?: unknown;
}

interface AcceptContentAttrs {
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

interface FirstLatencyPriorityContent {
    tag: "te";
    attrs: {
        priority: "2";
    };
    content: Buffer;
}

interface SecondLatencyPriorityContent {
    tag: "te";
    attrs: {
        priority: "1";
    };
    content: Buffer;
}

interface NetContent {
    tag: "net";
    attrs: {
        medium: "2";
    };
}

interface EncoptContent {
    tag: "encopt";
    attrs: {
        keygen: "2";
    };
}

export interface AcceptContent extends BaseContent<AcceptContentAttrs> {
    tag: "accept";
    attrs: AcceptContentAttrs;
    content: [
        AudioContent,
        FirstLatencyPriorityContent,
        SecondLatencyPriorityContent,
        NetContent,
        EncoptContent,
    ];
}
