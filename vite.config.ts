/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Build-time app version (read by the About page). Injected as a constant so it works
  // offline and in browser/E2E with no Tauri runtime dependency.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  // Vite 5's default target, kept explicit: Vite 7 defaults to Safari 16.4, but the app
  // supports macOS 13.0 (Safari 16.0, src-tauri/tauri.conf.json minimumSystemVersion).
  build: {
    target: ["es2020", "edge88", "firefox78", "chrome87", "safari14"],
  },

  // Tauri expects a fixed port; fail if it's not available.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  test: {
    globals: true,
    environment: "node",
    // Node 25+ turns Web Storage on: its `localStorage` warns in every worker without
    // --localstorage-file and hides jsdom's own storage. Off in test workers (DR-094).
    execArgv: ["--no-experimental-webstorage"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "ux-capture/**/*.test.ts"],
    // The app loads only the active dictionary (DR-009); tests get all three up front.
    setupFiles: ["src/i18n/__tests__/preload.ts"],
    // Engine benchmarks (P9, `pnpm bench`); git-ignored evidence benches stay out.
    benchmark: { include: ["src/**/*.bench.ts"] },
    // Coverage ratchet. Thresholds are per folder and only ever go up: the target where
    // met, else the measured value floored. Enforced by `pnpm test:coverage` in CI.
    // Re-baselined once for Vitest 4's AST-based v8 counting (ADR 0083).
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["**/__tests__/**", "**/*.test.*"],
      reporter: ["text-summary", "json-summary"],
      thresholds: {
        "src/engine/**": { lines: 95, branches: 90 },
        "src/data/**": { lines: 85, branches: 80 },
        "src/import/**": { lines: 85, branches: 80 },
        "src/lib/**": { lines: 95, branches: 90 },
        "src/ui/model/**": { lines: 94, branches: 92 },
        "src/state/**": { lines: 84, branches: 78 },
        "src/platform/**": { lines: 65, branches: 50 },
        // UI floors (P12, DR-171): measured values floored; raise over time.
        "src/ui/pages/**": { lines: 57, branches: 43 },
        "src/ui/components/**": { lines: 72, branches: 67 },
        "src/ui/hooks/**": { lines: 96, branches: 84 },
        "src/ui/*.{ts,tsx}": { lines: 60, branches: 64 },
      },
    },
  },
}));
