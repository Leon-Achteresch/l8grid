import { defineConfig, devices } from "@playwright/test";

const browsers = (process.env.E2E_BROWSERS ?? "chromium").split(",");
const executablePath = process.env.E2E_CHROMIUM_PATH;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: "http://localhost:5174" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: executablePath ? { executablePath } : {} } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ].filter((project) => browsers.includes(project.name)),
  webServer: {
    command: "npx vite e2e/app",
    url: "http://localhost:5174",
    reuseExistingServer: !process.env.CI,
  },
});
