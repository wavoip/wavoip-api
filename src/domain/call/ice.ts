export type IceCandidateKind = "host" | "srflx" | "prflx" | "relay";

const KINDS: readonly IceCandidateKind[] = ["host", "srflx", "prflx", "relay"];

/**
 * O tipo do candidato, lido da linha SDP quando a plataforma não o expõe como propriedade.
 *
 * O `RTCIceCandidate` do navegador tem `.type`; o do `react-native-webrtc` **não** — ele
 * carrega só `candidate`, `sdpMid` e `sdpMLineIndex`. Contar pelo `.type` zerava a conta
 * inteira no celular, e o diagnóstico acusava `NO_HOST_CANDIDATES` e `STUN_UNREACHABLE` num
 * aparelho que estava saudável, além de nunca encerrar a coleta antes do teto.
 *
 * A linha é padrão em toda plataforma:
 * `candidate:<fundação> <componente> <transporte> <prioridade> <ip> <porta> typ <tipo> …`
 */
function kindOf(candidate: { type?: string | null; candidate?: string | null } | null): IceCandidateKind | null {
    if (!candidate) return null;

    const declared = candidate.type ?? / typ (\w+)/.exec(candidate.candidate ?? "")?.[1];
    return KINDS.find((kind) => kind === declared) ?? null;
}

export const IceCandidates = { kindOf };

export type IceDiagnostics = {
    gatheringDurationMs: number;
    gatheringTimedOut: boolean;
    candidatesByType: Record<IceCandidateKind, number>;
    stunReached: boolean;
    turnReached: boolean;
    selectedCandidatePair?: {
        local: IceCandidateKind;
        remote: IceCandidateKind;
        rtt?: number;
    };
};

export type ConnectivityIssue =
    | "STUN_UNREACHABLE"
    | "ICE_GATHERING_TIMEOUT"
    | "ICE_CONNECTION_FAILED"
    | "NO_HOST_CANDIDATES"
    | "SYMMETRIC_NAT_SUSPECTED";

/** O que a chamada já sabe de ICE no instante em que alguém começa a observar. */
export type IceSnapshot = {
    readonly diagnostics: IceDiagnostics | null;
    readonly issues: readonly ConnectivityIssue[];
};
