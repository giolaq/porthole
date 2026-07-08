import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.PORTHOLE_URL ?? "http://127.0.0.1:3200",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    // Bundled Chromium lacks proprietary codecs; H.264 WebCodecs decode
    // needs branded Chrome (installed in CI via `playwright install chrome`).
    channel: "chrome",
  },
});
