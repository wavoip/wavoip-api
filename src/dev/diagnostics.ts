import { button, element, field, type Log } from "@/dev/ui";
import type { Wavoip } from "@/index";
// Interno de propósito: o caminho público para sondar STUN é o `runDiagnostics()`, que
// ainda não existe. Quando existir, este painel passa a chamá-lo.
import { runStunProbe } from "@/modules/media/StunProbe";
import { webPeerConnection } from "@/platform/web/webPeerConnection";

const DEFAULT_STUN = "stun:stun.l.google.com:19302, stun:stun.cloudflare.com:3478";

/** Os aparelhos de áudio que a biblioteca enxerga, relidos a cada segundo. */
export function audioPanel(wavoip: Wavoip): HTMLElement {
    const box = element("div", "audio");
    const line = element("p", "state");
    box.append(element("h2", undefined, "Áudio"), line);

    const describe = () => {
        const { audio } = wavoip;
        line.textContent = `${audio.listInputDevices().length} microfones · ${audio.listOutputDevices().length} saídas · entrada: ${audio.currentInput?.label || "padrão do sistema"} · saída: ${audio.currentOutput?.label || "padrão do sistema"}`;
    };
    setInterval(describe, 1_000);
    describe();
    return box;
}

/** O mesmo probe que o `troubleshooting.md` manda rodar quando o áudio não passa. */
export function stunPanel(log: Log): HTMLElement {
    const box = element("div", "stun");
    const servers = field("Servidores STUN", DEFAULT_STUN);
    const results = element("p", "state", "não testado");

    const probe = button("Testar STUN", async () => {
        results.textContent = "testando…";
        const list = servers.input.value.split(",").map((server) => server.trim());
        const probed = await runStunProbe(list, webPeerConnection);
        results.textContent = probed
            .map((r) => `${r.server}: ${r.reachable ? `ok em ${r.latencyMs ?? "?"}ms` : "inalcançável"}`)
            .join("\n");
        log.write(`stun: ${probed.filter((r) => r.reachable).length}/${probed.length} alcançáveis`);
    });

    box.append(element("h2", undefined, "Diagnóstico"), servers.row, probe, results);
    return box;
}
