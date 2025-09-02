export type DeviceBridge = {
    onOffer(token: string, call_id: string, peer: string): void;
    onAccept(call_id: string): void;
    onReject(call_id: string): void;
    onEnd(call_id: string): void;
    onAcceptedElsewhere(call_id: string): void;
    onRejectedElsewhere(call_id: string): void;
    onCreateAudio(server: { ip: string; port: string }): void;
    onEndAudio(): void;
    onError(call_id: string, err: string): void;
};
