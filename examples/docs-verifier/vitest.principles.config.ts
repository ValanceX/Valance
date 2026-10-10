import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["tests/principles/**/*.test.ts"], testTimeout: 60_000 } });
