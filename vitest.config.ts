import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        environment: "happy-dom",
        coverage: {
            provider: "v8",
            include: ["src/**"],
            exclude: ["src/modules/worklets/**"],
        },
    },
});
