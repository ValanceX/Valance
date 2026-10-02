import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["async/async.test.ts", "async/self-shutdown.test.ts", "async/failure.test.ts"] } });
