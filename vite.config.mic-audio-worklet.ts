import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    plugins: [tsconfigPaths()],
    build: {
        lib: {
            entry: "src/features/multimedia/transport/websocket/audio-input/AudioWorkletMic.ts",
            name: "AudioWorkletMic",
            formats: ["iife"],
            fileName: (_format, name) => `${name}.js`,
        },
        outDir: "src/features/multimedia/transport/websocket/audio-input",
        target: "esnext",
        emptyOutDir: false,
    },
});
