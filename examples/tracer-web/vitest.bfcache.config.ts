import { defineConfig } from "vitest/config";

// One real-Chromium test driven from Node (Playwright), at the TOP level of a browser tab: back/forward-cache restores only happen to top-level documents, never
// inside the iframes the vitest browser mode uses. Kept out of the default suites because it launches its own browser.
export default defineConfig({ test: { include: ["bfcache/**/*.test.ts"], testTimeout: 90_000, hookTimeout: 60_000 } });
