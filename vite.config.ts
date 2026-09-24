import path from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import tsconfigPaths from "vite-tsconfig-paths";
import pkg from "./package.json";
import { workletPlugin } from "./vite-plugin-worklet";

// O UMD não aceita múltiplas entradas, então são duas passadas: a ESM emite as entradas e
// os `.d.ts`, a UMD emite só o pacote do navegador, para quem carrega por `<script>`.
// `pnpm build` roda as duas; a segunda não pode limpar o que a primeira escreveu.
const umd = process.env.BUILD_FORMAT === "umd";

export default defineConfig({
    plugins: [tsconfigPaths(), workletPlugin(), ...(umd ? [] : [dts({ rollupTypes: true })])],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
        },
    },
    build: {
        emptyOutDir: !umd,
        lib: umd
            ? {
                  entry: "src/web.ts",
                  name: "WavoipAPI",
                  formats: ["umd"],
                  fileName: () => "web.umd.js",
              }
            : {
                  entry: { index: "src/index.ts", web: "src/web.ts" },
                  formats: ["es"],
                  fileName: (_format, name) => `${name}.es.js`,
              },
        rollupOptions: {
            external: [...Object.keys(pkg.dependencies || {})],
            output: {
                globals: {
                    "socket.io-client": "io",
                },
            },
        },
    },
});
