interface TerminateContentAttrs {
    "call-id": string;
    "call-creator": string;
    duration: string;
    audio_duration: string;
}

export interface TerminateContent {
    tag: "terminate";
    attrs: TerminateContentAttrs;
    content: [];
}
