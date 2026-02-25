import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    plugins: [tsconfigPaths()],
    build: {
        lib: {
            entry: "src/features/multimedia/transport/webrtc/ResampleFrom16Worklet.ts",
            name: "ResampleFrom16Worklet",
            formats: ["iife"],
            fileName: (_format, name) => `${name}.js`,
        },
        outDir: "src/features/multimedia/transport/webrtc",
        target: "esnext",
        emptyOutDir: false,
    },
});
