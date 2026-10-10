import { defineConfig } from "vitest/config";

// A smoke test of the BUILT site: builds it with the production command, serves it, and loads it in real Chromium.
export default defineConfig({ test: { include: ["smoke/**/*.test.ts"], testTimeout: 180_000, hookTimeout: 180_000 } });
