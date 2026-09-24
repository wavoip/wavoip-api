import type { PeerConnectionFactory } from "@/ports/runtime/PeerConnectionPort";
export type StunProbeResult = {
    server: string;
    reachable: boolean;
    latencyMs?: number;
};

const DEFAULT_PROBE_TIMEOUT_MS = 3000;

/**
 * Sonda uma lista de servidores STUN em paralelo. Um servidor conta como alcançável
 * quando junta ao menos um candidato `srflx` antes do tempo acabar. Cada sonda usa uma
 * conexão descartável, criada pela fábrica que a plataforma injeta — é o que faz a sonda
 * rodar igual no navegador, no React Native e no Node.
 *
 * Interna de propósito: o caminho público para checar a rede é o diagnóstico de ambiente.
 */
export function runStunProbe(
    servers: string[],
    createPeer: PeerConnectionFactory,
    timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS,
): Promise<StunProbeResult[]> {
    return Promise.all(servers.map((server) => probeOne(server, timeoutMs, createPeer)));
}

function probeOne(server: string, timeoutMs: number, createPeer: PeerConnectionFactory): Promise<StunProbeResult> {
    return new Promise((resolve) => {
        const startedAt = Date.now();
        const pc = createPeer({ iceServers: [{ urls: server }] });
        let settled = false;

        const cleanup = () => {
            settled = true;
            clearTimeout(timer);
            pc.close();
        };

        const finish = (result: StunProbeResult) => {
            if (settled) return;
            cleanup();
            resolve(result);
        };

        pc.addEventListener("icecandidate", (event) => {
            if (event.candidate?.type !== "srflx") return;
            finish({ server, reachable: true, latencyMs: Date.now() - startedAt });
        });

        const timer = setTimeout(() => {
            finish({ server, reachable: false });
        }, timeoutMs);

        try {
            pc.createDataChannel("probe");
            pc.createOffer()
                .then((offer) => pc.setLocalDescription(offer))
                .catch(() => finish({ server, reachable: false }));
        } catch {
            finish({ server, reachable: false });
        }
    });
}
