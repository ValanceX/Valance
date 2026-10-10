import { defineConfig } from "vitest/config";

// A smoke test of the BUILT sites: builds each with the production command, serves it, and loads it in real Chromium. The files share the build directory, so they run one after another.
export default defineConfig({ test: { include: ["smoke/**/*.test.ts"], testTimeout: 180_000, hookTimeout: 300_000, fileParallelism: false } });
