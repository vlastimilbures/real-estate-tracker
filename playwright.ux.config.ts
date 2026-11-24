import { defineConfig, devices } from "@playwright/test";
import { execSync } from "node:child_process";
import path from "node:path";
import { matrixOf, VIEWPORTS } from "./ux-capture/matrix";

// UX screenshot capture: `pnpm ux:capture` (CI runs its axe scan, F-08). Boots the Vite
// frontend with VITE_E2E=1, so the app runs on the in-memory sql.js seed (synthetic
// sample portfolio) — a real database is never opened. Its own port and no server reuse,
// so it never attaches to a running `pnpm tauri dev`. See ux-capture/README.md.

const PORT = Number(process.env.UX_PORT ?? 1430);

function viewportOf(name: string): { width: number; height: number } {
  const known = VIEWPORTS[name];
  if (known) return known;
  const m = /^(\d+)x(\d+)$/.exec(name);
  if (!m) throw new Error(`UX_VIEWPORT: unknown viewport "${name}"`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

function git(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

// One output folder per run, shared by all workers (they inherit this env).
if (!process.env.UX_OUT) {
  const sha = git("rev-parse --short HEAD") || "nogit";
  const dirty = git("status --porcelain") ? "-dirty" : "";
  const day = new Date().toISOString().slice(0, 10);
  const id = process.env.UX_RUN_ID ?? `${day}-${sha}${dirty}`;
  process.env.UX_OUT = path.resolve("ux-screens", id);
}

const { langs, themes, viewports } = matrixOf(process.env);

const projects = langs.flatMap((lang) =>
  themes.flatMap((theme) =>
    viewports.map((vp) => ({
      name: `${lang}-${theme}-${vp}`,
      metadata: { lang, theme },
      use: {
        ...devices["Desktop Chrome"],
        viewport: viewportOf(vp),
        deviceScaleFactor: Number(process.env.UX_SCALE ?? 1),
        colorScheme: theme as "light" | "dark",
        // Charts skip their entry animation (UX-058), so shots never catch one mid-way.
        reducedMotion: "reduce" as const,
      },
    })),
  ),
);

export default defineConfig({
  testDir: "ux-capture",
  // `pnpm ux:readme` swaps in readme.spec.ts (README screenshots).
  testMatch: process.env.UX_SPEC ?? "capture.spec.ts",
  outputDir: path.join(process.env.UX_OUT, ".playwright"),
  fullyParallel: true,
  forbidOnly: true,
  // One retry on CI, none locally (UX_RETRIES overrides): a screen that fails twice is a
  // regression and fails the run; one that passes on the retry is reported as flaky
  // (annotation, job summary, <UX_OUT>/flaky.json) by flakeReport.ts (#496).
  retries: Number(process.env.UX_RETRIES ?? (process.env.CI ? 1 : 0)),
  reporter: [["list"], ["./ux-capture/flakeReport.ts"]],
  globalTeardown: "./ux-capture/summary.ts",
  timeout: 90_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects,
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    env: { VITE_E2E: "1" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
