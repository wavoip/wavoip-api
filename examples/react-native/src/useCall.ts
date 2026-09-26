import type { ActiveCall, IceDiagnostics, IncomingCall, OutgoingCall, Wavoip } from "@wavoip/wavoip-api/react-native";
import { useCallback, useEffect, useState } from "react";
import { Trace } from "./trace.ts";

/**
 * Uma fase, um objeto — é assim que a biblioteca entrega a chamada, e é assim que a tela a
 * guarda. Nada de um objeto só com campos que valem em algumas fases e em outras não.
 */
export type CallPhase =
    | { readonly kind: "idle" }
    | { readonly kind: "offer"; readonly call: IncomingCall }
    | { readonly kind: "outgoing"; readonly call: OutgoingCall }
    | { readonly kind: "active"; readonly call: ActiveCall };

const IDLE: CallPhase = { kind: "idle" };

export type CallActions = {
    readonly phase: CallPhase;
    dial(to: string): Promise<void>;
    accept(): Promise<void>;
    reject(): Promise<void>;
    hangUp(): Promise<void>;
};

/** A chamada da tela: uma por vez, que é o que um telefone faz. */
export function useCall(wavoip: Wavoip | null): CallActions {
    const [phase, setPhase] = useState<CallPhase>(IDLE);
    const idle = useCallback(() => setPhase(IDLE), []);

    useEffect(() => {
        if (!wavoip) return;
        return wavoip.on("offer", (offer) => {
            Trace.write("oferta", `de ${offer.peer.phone}`);
            setPhase({ kind: "offer", call: offer });
            watchOffer(offer, idle);
        });
    }, [wavoip, idle]);

    const dial = useCallback(
        async (to: string) => {
            if (!wavoip) return;
            Trace.write("chamada", `discando para ${to}`);

            const { data: outgoing, error } = await wavoip.startCall({ to });
            if (error) {
                for (const attempt of error.devices) Trace.write("chamada", `recusada: ${attempt.error.code}`);
                return;
            }
            setPhase({ kind: "outgoing", call: outgoing });
            watchOutgoing(outgoing, setPhase, idle);
        },
        [wavoip, idle],
    );

    const accept = useCallback(async () => {
        if (phase.kind !== "offer") return;

        const { data: active, error } = await phase.call.accept();
        if (error) return Trace.write("oferta", `não deu para atender: ${error.code}`);

        setPhase({ kind: "active", call: active });
        watchActive(active, idle);
    }, [phase, idle]);

    const reject = useCallback(async () => {
        if (phase.kind !== "offer") return;
        const { error } = await phase.call.reject();
        Trace.write("oferta", error ? `não deu para recusar: ${error.code}` : "recusada");
        if (!error) idle();
    }, [phase, idle]);

    const hangUp = useCallback(async () => {
        if (phase.kind === "outgoing") await phase.call.cancel();
        if (phase.kind === "active") await phase.call.end();
        idle();
    }, [phase, idle]);

    return { phase, dial, accept, reject, hangUp };
}

function watchOffer(offer: IncomingCall, idle: () => void): void {
    offer.on("cancelled", () => finish("o contato desistiu", idle));
    offer.on("acceptedElsewhere", () => finish("atendida em outro aparelho", idle));
    offer.on("rejectedElsewhere", () => finish("recusada em outro aparelho", idle));
    offer.on("ended", () => finish("oferta encerrada", idle));
    offer.on("connectivityIssue", (issue) => Trace.write("ice", `problema: ${issue}`));
}

function watchOutgoing(outgoing: OutgoingCall, setPhase: (phase: CallPhase) => void, idle: () => void): void {
    outgoing.on("ringing", () => Trace.write("chamada", "o aparelho do contato está tocando"));
    outgoing.on("answered", () => Trace.write("chamada", "atendeu; subindo a mídia"));
    outgoing.on("accepted", (active) => {
        Trace.write("chamada", "mídia de pé");
        setPhase({ kind: "active", call: active });
        watchActive(active, idle);
    });
    outgoing.on("rejected", () => finish("o contato recusou", idle));
    outgoing.on("unanswered", () => finish("ninguém atendeu", idle));
    outgoing.on("failed", (failure) => finish(`falhou: ${failure.code}`, idle));
    outgoing.on("ended", () => finish("oferta encerrada", idle));
    outgoing.on("connectivityIssue", (issue) => Trace.write("ice", `problema: ${issue}`));
}

function watchActive(call: ActiveCall, idle: () => void): void {
    call.on("connectionChanged", (connection) => Trace.write("mídia", `conexão → ${connection}`));
    call.on("peerMuteChanged", (muted) => Trace.write("mídia", muted ? "o contato mutou" : "o contato desmutou"));
    call.on("iceDiagnostics", (diag) => Trace.write("ice", describeIce(diag)));
    call.on("connectivityIssue", (issue) => Trace.write("ice", `problema: ${issue}`));
    call.on("failed", (failure) => finish(`caiu: ${failure.code}`, idle));
    call.on("ended", () => finish("encerrada", idle));
}

function describeIce(diag: IceDiagnostics): string {
    const pair = diag.selectedCandidatePair;
    const stun = diag.stunReached ? "stun ok" : "stun não alcançado";
    return pair ? `${stun} · par ${pair.local}→${pair.remote}` : `${stun} · sem par escolhido`;
}

function finish(reason: string, idle: () => void): void {
    Trace.write("chamada", reason);
    idle();
}
