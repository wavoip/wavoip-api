import type { PeerConnectionFactory } from "@/ports/runtime/PeerConnectionPort";
import { webPeerConnection } from "@/platform/web/webPeerConnection";
export type StunProbeResult = {
    server: string;
    reachable: boolean;
    latencyMs?: number;
};

const DEFAULT_PROBE_TIMEOUT_MS = 3000;

/**
 * Probe a list of STUN servers in parallel. A server is reported as
 * `reachable: true` when at least one `srflx` candidate is gathered before
 * the timeout fires. Each probe uses its own throwaway RTCPeerConnection.
 *
 * Pass `createPeer` to probe from a runtime other than the browser; it defaults to the
 * browser's own `RTCPeerConnection`.
 *
 * @example
 *   const results = await runStunProbe([
 *       "stun:stun.l.google.com:19302",
 *       "stun:stun.cloudflare.com:3478",
 *   ]);
 */
export function runStunProbe(
    servers: string[],
    timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS,
    createPeer: PeerConnectionFactory = webPeerConnection,
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
