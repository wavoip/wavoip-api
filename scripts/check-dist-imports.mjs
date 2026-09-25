// Cada caminho publicado tem que resolver de verdade, nas duas convenções de módulo.
//
// O teste vai pelo nome do pacote, e não pelo caminho do arquivo: assim ele passa pelo mapa
// de `exports` do `package.json`, que é o que o consumidor realmente usa. Um `exports` com o
// caminho errado é tão quebrado quanto um bundle inválido, e só isto pega os dois.
//
// O Vitest não substitui este passo: ele passa pelo Vite, que transforma dependência
// CommonJS em `require` e faz named import de CJS funcionar. No pacote publicado não há
// transformação, e um `import { nonstandard } from "@roamhq/wrtc"` quebra com `Named export
// not found` — que foi exatamente o que aconteceu com a entrada `/node`.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const PATHS = ["@wavoip/wavoip-api", "@wavoip/wavoip-api/web", "@wavoip/wavoip-api/node"];

for (const path of PATHS) {
    await check(`import("${path}")`, async () => await import(path));
    // O UMD do `/web` responde ao `require` como CommonJS; o resto tem um `.cjs` próprio.
    await check(`require("${path}")`, () => require(path));
}

async function check(label, load) {
    try {
        const loaded = await load();
        const exports = loaded.Wavoip ? loaded : loaded.default;
        if (typeof exports?.Wavoip !== "function") {
            throw new Error(`resolveu, mas não entrega o Wavoip: ${Object.keys(loaded).join(", ")}`);
        }
    } catch (error) {
        console.error(`Um caminho publicado não resolve em Node — ${label}:\n`);
        console.error(error.message);
        process.exit(1);
    }
}
