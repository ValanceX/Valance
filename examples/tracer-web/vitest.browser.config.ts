import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["browser/**/*.test.ts"],
    globalSetup: ["browser/setup.ts"],
    browser: { enabled: true, provider: "playwright", headless: true, instances: [{ browser: "chromium" }] },
  },
});
