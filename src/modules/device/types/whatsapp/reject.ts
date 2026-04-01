interface BaseContent<T> {
    tag: string;
    attrs: T;
    content?: unknown;
}

interface RejectContentAttrs {
    reason?: string;
    "call-id": string;
    count: "0";
    "call-creator": string;
}

export interface RejectContent extends BaseContent<RejectContentAttrs> {
    tag: "reject";
    attrs: RejectContentAttrs;
    content: [];
}
