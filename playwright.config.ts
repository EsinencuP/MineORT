import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3200);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

// Smoke runs against a production build with every wave flag OFF (P0 only),
// unless E2E_BASE_URL points at a deployed staging/preview.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1, // staging specs share fixture users
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    // Local escape hatch: reuse an already installed Chromium instead of downloading one.
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile-320",
      use: { ...devices["Pixel 5"], viewport: { width: 320, height: 640 } },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && npx next start -p ${port}`,
        url: baseURL,
        reuseExistingServer: false,
        env: {
          APP_URL: baseURL,
          APP_ENV: "local",
          TEST_LOGIN_ENABLED: process.env.TEST_LOGIN_ENABLED ?? "",
          TEST_LOGIN_SECRET: process.env.TEST_LOGIN_SECRET ?? "",
        },
        timeout: 180_000,
      },
});
