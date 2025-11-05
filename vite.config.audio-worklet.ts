import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    plugins: [tsconfigPaths()],
    build: {
        lib: {
            entry: "src/features/multimedia/transport/websocket/audio-output/AudioWorklet.ts",
            name: "AudioWorklet",
            formats: ["iife"],
            fileName: (_format, name) => `${name}.js`,
        },
        outDir: "src/features/multimedia/transport/websocket/audio-output",
        target: "esnext",
        emptyOutDir: false,
    },
});
