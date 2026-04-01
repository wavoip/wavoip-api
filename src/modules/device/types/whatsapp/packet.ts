export interface CallPacketModel<Attrs, Content> {
    tag: "call";
    attrs: Attrs;
    content: [Content];
}

export interface CallACKPacketModel<Type, Content> {
    tag: "ack";
    attrs: {
        from: string;
        class: "call";
        type: Type;
        id: string;
    };
    content: Content;
}
