import type { Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Resolve `?worklet` imports to a no-op blob URL so MediaManager (which
// addModule()s these at construction time) can be imported under vitest
// without invoking the real vite-plugin-worklet bundler.
function workletStubPlugin(): Plugin {
    return {
        name: "vitest-worklet-stub",
        enforce: "pre",
        resolveId(id) {
            if (!id.includes("?worklet")) return;
            return `\0worklet-stub:${id}`;
        },
        load(id) {
            if (!id.startsWith("\0worklet-stub:")) return;
            return `export default "blob:worklet-stub";`;
        },
    };
}

export default defineConfig({
    plugins: [tsconfigPaths(), workletStubPlugin()],
    test: {
        environment: "happy-dom",
        coverage: {
            provider: "v8",
            include: ["src/**"],
            exclude: ["src/modules/worklets/**"],
        },
    },
});
