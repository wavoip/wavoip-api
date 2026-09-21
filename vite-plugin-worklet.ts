import path from "node:path";
import type { OutputChunk, RollupOutput } from "rollup";
import type { Plugin } from "vite";
import { build } from "vite";

export function workletPlugin(): Plugin {
    return {
        name: "vite-plugin-worklet",
        enforce: "pre",
        async resolveId(id, importer) {
            if (!id.includes("?worklet")) return;
            const cleanId = id.replace("?worklet", "");

            // Especificador de pacote ("@scope/pkg/dist/foo.js?worklet") vai para o resolver
            // do bundler, que segue `exports` e node_modules; caminho local fica no
            // path.resolve.
            const isRelative = cleanId.startsWith("./") || cleanId.startsWith("../") || path.isAbsolute(cleanId);
            if (isRelative) {
                const resolved = importer ? path.resolve(path.dirname(importer), cleanId) : path.resolve(cleanId);
                return `\0worklet:${resolved}`;
            }

            const resolved = await this.resolve(cleanId, importer, { skipSelf: true });
            if (!resolved) return;
            return `\0worklet:${resolved.id}`;
        },
        async load(id) {
            if (!id.startsWith("\0worklet:")) return;
            const filePath = id.slice("\0worklet:".length);
            const result = await build({
                configFile: false,
                logLevel: "silent",
                build: {
                    lib: {
                        entry: filePath,
                        formats: ["iife"],
                        name: "_w",
                    },
                    minify: true,
                    write: false,
                },
            });
            const outputs = Array.isArray(result) ? result : [result as RollupOutput];
            const chunk = outputs[0].output[0] as OutputChunk;
            const escaped = JSON.stringify(chunk.code);
            return `export default URL.createObjectURL(new Blob([${escaped}], { type: "application/javascript" }));`;
        },
    };
}
