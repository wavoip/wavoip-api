// Um processo que terminou o trabalho tem que conseguir sair, mesmo com o worker de
// reamostragem já criado.
//
// O `worker.unref()` sozinho não basta: escutar `message` volta a segurar o event loop, e
// se o `unref` vier antes do listener o bot fica pendurado para sempre depois da última
// chamada. Só se descobre isso rodando um processo de verdade e esperando ele sair.
import { spawn } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TIMEOUT_MS = 15_000;
const script = join(tmpdir(), `wavoip-worker-exit-${process.pid}.mjs`);

writeFileSync(
    script,
    `import { nodeRuntime } from "${new URL("../dist/node.mjs", import.meta.url).href}";
     const rt = nodeRuntime({
         source: { sampleRate: 44100, start() {}, stop() {} },
         sink: { sampleRate: 48000, write: () => {}, end() {} },
         resampleInWorker: true,
     });
     rt.engine.playPcm().write(new Int16Array(160).buffer);
     setTimeout(() => {}, 200);`,
);

const child = spawn(process.execPath, [script], { stdio: "pipe" });
const killer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);

child.on("exit", (code, signal) => {
    clearTimeout(killer);
    rmSync(script, { force: true });

    if (signal === "SIGKILL") {
        console.error(`O worker de reamostragem prende o processo: ele não saiu em ${TIMEOUT_MS}ms.`);
        console.error("Verifique se o `unref()` vem depois do listener de `message` no WorkerConverter.");
        process.exit(1);
    }
    if (code !== 0) {
        console.error(`O processo com worker saiu com código ${code}.`);
        process.exit(1);
    }
});
