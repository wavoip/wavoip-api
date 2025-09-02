import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    plugins: [tsconfigPaths()],
    build: {
        lib: {
            entry: "src/features/multimedia/audio/AudioWorklet.ts",
            name: "AudioWorklet",
            formats: ["iife"],
            fileName: (_format, name) => `${name}.js`,
        },
        outDir: "src/features/multimedia/audio",
        target: "esnext",
        emptyOutDir: false,
    },
});
