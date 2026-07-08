import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.PORTHOLE_URL ?? "http://127.0.0.1:3200",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
});
