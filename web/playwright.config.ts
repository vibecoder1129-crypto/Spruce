import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const apiPort = 8100;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      // The real API, on the test database. Needs Postgres and Redis running.
      command: `cd ../api && uv run alembic upgrade head && uv run uvicorn app.main:app --host 127.0.0.1 --port ${apiPort}`,
      url: `http://127.0.0.1:${apiPort}/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        SPRUCE_ENV: "test",
        SPRUCE_EMAIL_BACKEND: "console",
        SPRUCE_COOKIE_SECURE: "false",
        SPRUCE_DATA_KEY: "ZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGQ=",
        SPRUCE_INDEX_KEY: "aWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWk=",
      },
    },
    {
      command: `npm run start -- -p ${port} -H 127.0.0.1`,
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: !process.env.CI,
      env: { SPRUCE_API_URL: `http://127.0.0.1:${apiPort}` },
    },
  ],
});
