import {
    type ConnectionStatus,
    type Device,
    type DeviceStatus,
    type DiagnosticsReport,
    Wavoip,
    reactNativeRuntime,
    runDiagnostics,
} from "@wavoip/wavoip-api/react-native";
import { useCallback, useState } from "react";

/** O relatório traz uma leitura por tipo de chamada: a oficial e a não oficial. */
export type CallReadiness = DiagnosticsReport["readiness"];
import { Trace } from "./trace.ts";

export type Session = {
    readonly wavoip: Wavoip;
    readonly device: Device;
};

/** O runtime é um só para o app inteiro: ele carrega o microfone e a sessão de áudio do sistema. */
const runtime = reactNativeRuntime();

export type SessionState = {
    readonly session: Session | null;
    readonly status: DeviceStatus | null;
    readonly connection: ConnectionStatus | null;
    readonly readiness: CallReadiness | null;
    connect(token: string): Promise<void>;
};

/**
 * Conecta um device e acompanha o que ele conta de si.
 *
 * O diagnóstico roda antes da primeira chamada, e não depois de ela falhar: é ele que separa
 * "falta permissão de microfone" de "a chamada não completou".
 */
export function useSession(): SessionState {
    const [session, setSession] = useState<Session | null>(null);
    const [status, setStatus] = useState<DeviceStatus | null>(null);
    const [connection, setConnection] = useState<ConnectionStatus | null>(null);
    const [readiness, setReadiness] = useState<CallReadiness | null>(null);

    const connect = useCallback(async (token: string) => {
        setReadiness(await diagnose());

        const wavoip = new Wavoip({ tokens: [token], runtime });
        const device = wavoip.devices[0];
        if (!device) return Trace.write("device", "o token não corresponde a nenhum device");

        watchDevice(device, setStatus, setConnection);
        setStatus(device.status);
        setSession({ wavoip, device });
    }, []);

    return { session, status, connection, readiness, connect };
}

async function diagnose(): Promise<CallReadiness> {
    const report = await runDiagnostics({ runtime });

    for (const check of report.checks) Trace.write("ambiente", `${check.severity} · ${check.code}`);
    return report.readiness;
}

function watchDevice(
    device: Device,
    onStatus: (status: DeviceStatus) => void,
    onConnection: (status: ConnectionStatus) => void,
): void {
    Trace.write("device", `status ${device.status} · conexão ${device.connectionStatus}`);
    device.on("statusChanged", (status) => {
        onStatus(status);
        Trace.write("device", `status → ${status}`);
    });
    device.on("connectionStatusChanged", (status) => {
        onConnection(status);
        Trace.write("device", `conexão → ${status}`);
    });
    device.on("contactChanged", (contact) => Trace.write("device", `número ${contact?.phone ?? "nenhum"}`));
    device.on("restrictionChanged", (restriction) =>
        Trace.write("device", restriction ? "restrito pelo WhatsApp" : "sem restrição"),
    );
}
