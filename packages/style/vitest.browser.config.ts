import { defineConfig } from "vitest/config";

// The theme in a real browser (Chromium, through Playwright): the compiled stylesheet is applied to the primitives the web draws, and what the browser computes is compared with what the tokens say.
export default defineConfig({
  test: {
    include: ["browser/**/*.browser.test.ts"],
    globalSetup: ["browser/setup.ts"],
    browser: { enabled: true, provider: "playwright", headless: true, instances: [{ browser: "chromium" }] },
  },
});
