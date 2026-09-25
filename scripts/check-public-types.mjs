// Todo `.d.ts` publicado tem que compilar sem DOM. Quem instala a biblioteca no React Native
// não tem `lib: dom` no tsconfig, então um `AnalyserNode` ou um `MediaDeviceInfo` na
// superfície quebra o build dele, e não o nosso (DEV-277).
//
// Vale também para a entrada `/web`: ela carrega a implementação do navegador, mas o que ela
// devolve é o `WavoipRuntime`, que é neutro. Se um tipo do DOM escapar para a assinatura, é
// aqui que se descobre.
import { execFileSync } from "node:child_process";

const PUBLISHED = ["dist/index.d.ts", "dist/web.d.ts", "dist/node.d.ts"];

for (const dts of PUBLISHED) {
    try {
        execFileSync(
            "node_modules/.bin/tsc",
            ["--noEmit", "--strict", "--lib", "ES2022", "--typeRoots", "/dev/null", dts],
            { stdio: "pipe" },
        );
    } catch (error) {
        console.error(`A superfície pública cita tipo que só existe no navegador (${dts}):\n`);
        console.error(error.stdout?.toString() ?? error.message);
        process.exit(1);
    }
}
