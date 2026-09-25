// Cada entrada publicada tem que importar de verdade, em Node, a partir do `dist`.
//
// O Vitest não cobre isto: ele passa pelo Vite, que transforma dependência CommonJS em
// `require` e faz named import de CJS funcionar. No pacote publicado não há transformação,
// e um `import { nonstandard } from "@roamhq/wrtc"` quebra com `Named export not found` —
// que foi exatamente o que aconteceu com a entrada `/node`.
//
// Importar a entrada `/web` em Node também tem que funcionar: é o que sustenta SSR.
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const ENTRIES = ["dist/index.mjs", "dist/web.mjs", "dist/node.mjs"];

for (const entry of ENTRIES) {
    try {
        const loaded = await import(pathToFileURL(resolve(entry)).href);
        if (typeof loaded.Wavoip !== "function") {
            throw new Error(`importou, mas não exporta o Wavoip: ${Object.keys(loaded).join(", ")}`);
        }
    } catch (error) {
        console.error(`A entrada publicada não importa em Node (${entry}):\n`);
        console.error(error.message);
        process.exit(1);
    }
}
