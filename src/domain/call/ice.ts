export type IceCandidateKind = "host" | "srflx" | "prflx" | "relay";

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
