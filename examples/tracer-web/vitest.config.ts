import { defineConfig } from "vitest/config";

// `@valancex/nexus` is inlined so a test can `vi.mock` the MESH runtime's `render` that NEXUS imports (test/render-supersession.test.ts); nothing else depends on it.
export default defineConfig({ test: { include: ["test/**/*.test.ts"], server: { deps: { inline: ["@valancex/nexus"] } } } });
