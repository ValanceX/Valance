import { defineConfig } from "vitest/config";

// These tests build and serve the application and drive it in real Chromium, one file after another.
export default defineConfig({ test: { include: ["test/**/*.test.ts"], testTimeout: 90_000, hookTimeout: 180_000, fileParallelism: false } });
