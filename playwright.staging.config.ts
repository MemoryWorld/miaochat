import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.AGENTHUB_WEB_BASE_URL;

if (!baseURL) {
  throw new Error(
    "AGENTHUB_WEB_BASE_URL is required for the staging Playwright suite."
  );
}

export default defineConfig({
  testDir: "./tests/e2e-playwright-staging",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    baseURL,
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ]
});
