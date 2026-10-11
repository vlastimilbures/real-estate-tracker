import { defineConfig, devices } from "@playwright/test";

// Opt-in E2E config. Specs live in /e2e (outside src/) so Vitest's
// `src/**/*.{test,spec}.ts` include never tries to run them. The web server boots the
// real Vite frontend with VITE_E2E=1, which makes portfolioStore.defaultOpen fall back to
// the in-memory sql.js adapter (the app otherwise refuses to run outside Tauri).
// Its own port, never reused: 1420 is the Tauri dev server, which runs without VITE_E2E
// and would time the specs out (#141). ux-capture uses 1430.
const PORT = Number(process.env.E2E_PORT ?? 1440);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    env: { VITE_E2E: "1" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
