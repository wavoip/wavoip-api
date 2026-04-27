import path from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import tsconfigPaths from "vite-tsconfig-paths";
import pkg from "./package.json";
import { workletPlugin } from "./vite-plugin-worklet";

export default defineConfig({
    plugins: [tsconfigPaths(), dts({ rollupTypes: true }), workletPlugin()],
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
            external: [...Object.keys(pkg.dependencies || {})],
            output: {
                globals: {
                    "socket.io-client": "io",
                    axios: "axios",
                    "@alexanderolsen/libsamplerate-js": "libsamplerate",
                },
            },
        },
    },
});
