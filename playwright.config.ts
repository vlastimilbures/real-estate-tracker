import { defineConfig, devices } from "@playwright/test";

// Opt-in E2E config. Specs live in /e2e (outside src/) so Vitest's
// `src/**/*.{test,spec}.ts` include never tries to run them. The web server boots the
// real Vite frontend with VITE_E2E=1, which makes portfolioStore.defaultOpen fall back to
// the in-memory sql.js adapter (the app otherwise refuses to run outside Tauri).
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:1420",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:1420",
    env: { VITE_E2E: "1" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
