import type { ConnectivityIssue } from "@/domain/call/ice";

// O `RTCPeerConnection` como o núcleo precisa dele, com tipos nossos no formato do
// navegador. O react-native-webrtc tem a mesma forma, então o adaptador de lá cabe aqui sem
// o núcleo saber. Só `addEventListener`: os handlers `on*` não existem em toda implementação.

/** A STUN or TURN server, in the same shape the browser expects. */
export type IceServer = { urls: string | string[]; username?: string; credential?: string };

export type SessionDescription = { type: "offer" | "answer" | "pranswer" | "rollback"; sdp?: string };

export type PeerConnectionState = "new" | "connecting" | "connected" | "disconnected" | "failed" | "closed";
export type IceConnectionState = "new" | "checking" | "connected" | "completed" | "disconnected" | "failed" | "closed";
export type IceGatheringState = "new" | "gathering" | "complete";

/** Uma linha do `getStats`: o `type` diz o que ela é, e o resto varia com ele. */
export type StatEntry = { readonly type: string; readonly kind?: string; readonly [field: string]: unknown };
export type StatsReport = { values(): Iterable<StatEntry> };

export type PeerConnectionEvents = {
    icecandidate: { candidate: { type?: string | null } | null };
    track: { streams: readonly MediaStreamLike[] };
    connectionstatechange: unknown;
    iceconnectionstatechange: unknown;
    icegatheringstatechange: unknown;
};

/** Subconjunto estrutural do `MediaStream`, que o react-native-webrtc também atende. */
export type MediaTrackLike = {
    enabled: boolean;
    stop(): void;
    getSettings(): { deviceId?: string };
    addEventListener(type: "mute" | "unmute" | "ended", listener: () => void): void;
    removeEventListener(type: "mute" | "unmute" | "ended", listener: () => void): void;
};

export type MediaStreamLike = {
    getTracks(): MediaTrackLike[];
    getAudioTracks(): MediaTrackLike[];
    addTrack(track: MediaTrackLike): void;
    removeTrack(track: MediaTrackLike): void;
};

export interface PeerConnectionLike {
    readonly connectionState: PeerConnectionState;
    readonly iceConnectionState: IceConnectionState;
    readonly iceGatheringState: IceGatheringState;
    readonly localDescription: SessionDescription | null;
    createOffer(): Promise<SessionDescription>;
    createAnswer(): Promise<SessionDescription>;
    setLocalDescription(description: SessionDescription): Promise<void>;
    setRemoteDescription(description: SessionDescription): Promise<void>;
    addTrack(track: MediaTrackLike, stream: MediaStreamLike): unknown;
    /** Só a sonda de STUN usa: sem uma mídia, o ICE não junta candidato nenhum. */
    createDataChannel(label: string): unknown;
    getStats(): Promise<StatsReport>;
    close(): void;
    addEventListener<E extends keyof PeerConnectionEvents>(
        type: E,
        listener: (event: PeerConnectionEvents[E]) => void,
    ): void;
    removeEventListener<E extends keyof PeerConnectionEvents>(
        type: E,
        listener: (event: PeerConnectionEvents[E]) => void,
    ): void;
}

export type PeerConnectionFactory = (config: { iceServers: IceServer[] }) => PeerConnectionLike;

/** O que o diagnóstico de ICE precisa saber de um candidato, sem depender do tipo do navegador. */
export type CandidateKindOf = (candidate: { type?: string | null }) => ConnectivityIssue | null;
