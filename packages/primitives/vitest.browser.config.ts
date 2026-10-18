import { defineConfig } from "vitest/config";

// The keyboard verification in a real browser (Chromium, through Playwright): a key is pressed as a person presses it, and what the page does is what is compared with the specification.
export default defineConfig({
  test: {
    include: ["browser/**/*.browser.test.ts"],
    browser: { enabled: true, provider: "playwright", headless: true, instances: [{ browser: "chromium" }] },
  },
});
