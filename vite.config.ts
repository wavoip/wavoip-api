import path from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { viteStaticCopy } from "vite-plugin-static-copy";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    plugins: [
        tsconfigPaths(),
        dts({
            entryRoot: "src",
            outDir: "dist/types",
            insertTypesEntry: true,
        }),
        viteStaticCopy({
            targets: [
                { src: "src/features/multimedia/audio/AudioWorklet.js", dest: "" },
                { src: "src/features/multimedia/microphone/AudioWorkletMic.js", dest: "" },
            ],
        }),
    ],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
        },
    },
    publicDir: "public",
    build: {
        lib: {
            entry: "src/index.ts",
            name: "wavoip-api",
            formats: ["es", "cjs"],
            fileName: (format) => `index.${format}.js`,
        },
        outDir: "dist",
        rollupOptions: {
            external: ["axios", "socket.io-client"],
        },
        emptyOutDir: true,
    },
});
