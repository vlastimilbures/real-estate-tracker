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
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Engine benchmarks (P9, `pnpm bench`); git-ignored evidence benches stay out.
    benchmark: { include: ["src/**/*.bench.ts"] },
    // Coverage ratchet. Thresholds are per folder and only ever go up: the target where
    // met, else the measured value floored. Enforced by `pnpm test:coverage` in CI.
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
        "src/state/**": { lines: 84, branches: 82 },
        "src/platform/**": { lines: 79, branches: 81 },
        // UI floors (P12, DR-171): measured values floored; raise over time.
        "src/ui/pages/**": { lines: 66, branches: 66 },
        "src/ui/components/**": { lines: 73, branches: 85 },
        "src/ui/hooks/**": { lines: 97, branches: 86 },
        "src/ui/*.{ts,tsx}": { lines: 60, branches: 79 },
      },
    },
  },
}));
