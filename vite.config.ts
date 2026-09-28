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
    plugins: [tsconfigPaths(), workletPlugin(), ...(umd
            ? []
            : [
                  // Sem `rollupTypes`: achatar cada entrada num `.d.ts` só fazia cada uma
                  // redeclarar a classe `Wavoip`, e classe com membro privado é comparada
                  // pelo nome, não pela forma. O integrador que importasse o tipo do núcleo e
                  // a classe de `/web` recebia "Wavoip is not assignable to Wavoip".
                  dts({
                      // Sem o achatamento, o gerador percorre tudo que o `tsconfig` inclui, e
                      // os testes e o playground iam parar no pacote publicado.
                      exclude: ["src/test/**", "src/dev/**", "**/*.test.ts", "**/*.spec.ts"],
                  }),
              ])],
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
                  entry: {
                      index: "src/index.ts",
                      web: "src/web.ts",
                      node: "src/node.ts",
                      "react-native": "src/react-native.ts",
                      // Não é uma entrada de import: é o arquivo que o `new Worker(...)`
                      // carrega em tempo de execução, e por isso precisa existir no `dist`.
                      "node-worker": "src/platform/node/resampleWorker.ts",
                  },
                  formats: ["es", "cjs"],
                  fileName: (format, name) => `${name}.${format === "es" ? "mjs" : "cjs"}`,
              },
        rollupOptions: {
            external: [
                // Builtin do Node nunca é empacotado: quem o importa é a entrada `/node`,
                // e lá ele existe. Sem isto o Vite tenta resolvê-lo como módulo de navegador.
                /^node:/,
                ...Object.keys(pkg.dependencies || {}),
                ...Object.keys(pkg.peerDependencies || {}),
            ],
            output: {
                globals: {
                    "socket.io-client": "io",
                },
            },
        },
    },
});
