// O `.d.ts` publicado tem que compilar sem DOM. Quem instala a biblioteca no React Native
// não tem `lib: dom` no tsconfig, então um `AnalyserNode` ou um `MediaDeviceInfo` na
// superfície quebra o build dele, e não o nosso (DEV-277).
import { execFileSync } from "node:child_process";

const DTS = "dist/index.d.ts";

try {
    execFileSync("node_modules/.bin/tsc", ["--noEmit", "--strict", "--lib", "ES2022", "--typeRoots", "/dev/null", DTS], {
        stdio: "pipe",
    });
} catch (error) {
    console.error(`A superfície pública cita tipo que só existe no navegador (${DTS}):\n`);
    console.error(error.stdout?.toString() ?? error.message);
    process.exit(1);
}
