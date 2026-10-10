import { defineConfig } from "vitest/config";

// The budget: a generated site of hundreds of pages, built and exported, with the sizes and times a reader and a build can live with. Slow on purpose, so it has its own command.
export default defineConfig({ test: { include: ["budget/**/*.test.ts"], testTimeout: 300_000, hookTimeout: 300_000 } });
