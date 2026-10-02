import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["async/async.browser.test.ts"],
    globalSetup: ["async/setup.ts"],
    browser: { enabled: true, provider: "playwright", headless: true, instances: [{ browser: "chromium" }] },
  },
});
