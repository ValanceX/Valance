import { defineConfig } from "vitest/config";

// A smoke test of the BUILT page: it builds `dist/page` with the production command, serves it with src/serve.ts, and loads it in real Chromium. No dev server.
export default defineConfig({ test: { include: ["smoke/**/*.test.ts"], testTimeout: 120_000, hookTimeout: 120_000 } });
