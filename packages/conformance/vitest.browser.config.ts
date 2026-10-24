import { defineConfig } from "vitest/config";

// The vectors in a real browser (Chromium, through Playwright): the web adapter drives real events and real key presses.
export default defineConfig({
  test: {
    include: ["browser/**/*.browser.test.ts"],
    browser: { enabled: true, provider: "playwright", headless: true, instances: [{ browser: "chromium" }] },
  },
});
