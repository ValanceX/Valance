import { defineConfig } from "vitest/config";

// Visual regression: screenshots of the built sites compared with the ones taken last time. Slow and about pixels, so it has its own command.
export default defineConfig({ test: { include: ["visual/**/*.test.ts"], testTimeout: 180_000, hookTimeout: 900_000, fileParallelism: false } });
