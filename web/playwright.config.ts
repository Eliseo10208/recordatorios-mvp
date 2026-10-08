import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 120_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    {
      name: "mobile-webkit",
      testMatch: "ui-polish.spec.ts",
      grep: /@mobile/,
      use: { browserName: "webkit", viewport: { width: 390, height: 844 } },
    },
  ],
  reporter: "list",
});
