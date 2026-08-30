// Playwright regression config for the Krewe of Shamrock static site.
// Serves the repository root with Python's http.server (no build step needed).
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./specs",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: 4,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1280, height: 900 },
    // Use a system chromium when provided (e.g. CHROMIUM_PATH or the
    // pre-installed /opt/pw-browsers/chromium) instead of downloading one.
    launchOptions: process.env.CHROMIUM_PATH || require("node:fs").existsSync("/opt/pw-browsers/chromium")
      ? { executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" }
      : {},
  },
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1 --directory ..",
    url: "http://127.0.0.1:4173/index.html",
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
