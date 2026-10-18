import { defineConfig, devices } from "@playwright/test";

const liveSession = process.env.PORTHOLE_E2E === "1";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: {
    baseURL:
      process.env.PORTHOLE_URL ??
      (liveSession ? "http://127.0.0.1:3200" : "http://127.0.0.1:4173"),
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    // Bundled Chromium lacks proprietary codecs; H.264 WebCodecs decode
    // needs branded Chrome (installed in CI via `playwright install chrome`).
    channel: "chrome",
  },
  webServer:
    liveSession || process.env.PORTHOLE_URL
      ? undefined
      : {
          command:
            "npm run dev -w porthole-client -- --host 127.0.0.1 --port 4173 --strictPort",
          url: "http://127.0.0.1:4173",
          reuseExistingServer: !process.env.CI,
        },
});
