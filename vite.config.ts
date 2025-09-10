import path from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { viteStaticCopy } from "vite-plugin-static-copy";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    plugins: [
        tsconfigPaths(),
        dts({ rollupTypes: true }),
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
    build: {
        lib: {
            entry: "src/index.ts",
            name: "WavoipAPI",
            formats: ["es", "umd"],
            fileName: (format) => `index.${format}.js`,
        },
        emptyOutDir: true,
        rollupOptions: {
            external: ["socket_ioClient"],
        },
    },
});
