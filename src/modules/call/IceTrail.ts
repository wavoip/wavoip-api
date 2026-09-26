import type { ConnectivityIssue, IceDiagnostics, IceSnapshot } from "@/domain/call/ice";

type IceListener = (...args: never[]) => void;

/**
 * Guarda o diagnóstico de ICE e reentrega a quem assina depois.
 *
 * A coleta de candidatos de quem liga roda dentro do `createOffer()`, antes de a chamada
 * existir — e quem observa só recebe o objeto da chamada depois disso. Sem a trilha, o
 * diagnóstico se perde justamente na falha em que ele é a única pista: a chamada que nunca
 * conecta.
 */
export class IceTrail {
    private diagnostics: IceDiagnostics | null;
    private readonly issues: ConnectivityIssue[];

    constructor(seed: IceSnapshot) {
        this.diagnostics = seed.diagnostics;
        this.issues = [...seed.issues];
    }

    remember(diagnostics: IceDiagnostics): void {
        this.diagnostics = diagnostics;
    }

    rememberIssue(issue: ConnectivityIssue): void {
        if (this.issues.includes(issue)) return;
        this.issues.push(issue);
    }

    /** O `event` é o nome público, que é o mesmo nos três proxies. */
    replayTo(event: string, listener: IceListener): void {
        if (event === "iceDiagnostics") {
            if (this.diagnostics) (listener as unknown as (diag: IceDiagnostics) => void)(this.diagnostics);
            return;
        }
        if (event !== "connectivityIssue") return;
        for (const issue of this.issues) (listener as unknown as (issue: ConnectivityIssue) => void)(issue);
    }
}
