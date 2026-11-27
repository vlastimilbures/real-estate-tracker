// The CI axe shards (ci.yml `axe-shard`) run every capture test exactly once: for each
// sharded ux:capture step, as gates.mjs holds it (ciDrift keeps it equal to ci.yml), the
// tests Playwright lists for shards 1..N are the whole run's tests, none twice and no
// shard empty. `playwright test --list` loads the specs only: no browser, no web server.
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { GATES } from "../gates.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PLAYWRIGHT = join(ROOT, "node_modules", ".bin", "playwright");
const SHARD = /--shard \$\{\{ matrix\.shard \}\}\/(\d+)/;
const out = mkdtempSync(join(tmpdir(), "ux-shards-"));
afterAll(() => rmSync(out, { recursive: true, force: true }));

const sharded = GATES.flatMap((g) =>
  (g.ci ?? [])
    .filter((s) => SHARD.test(s.run))
    .map((s) => ({ id: g.id, ...s })),
);

/** The tests `--list` prints: one "[project] › file:line:col › title" line each. */
async function list(env, args) {
  const { stdout } = await promisify(execFile)(
    PLAYWRIGHT,
    ["test", "-c", "playwright.ux.config.ts", "--list", ...args],
    { cwd: ROOT, env: { ...process.env, ...env, UX_OUT: out } },
  );
  return stdout
    .split("\n")
    .filter((l) => /^\s+\[[^\]]+\] › /.test(l))
    .map((l) => l.trim());
}

describe("CI axe shards", () => {
  it("covers both sharded capture steps", () => {
    expect(sharded.map((s) => s.id)).toEqual(["axe", "axe-i18n"]);
  });

  for (const step of sharded) {
    it(`${step.id}: shards 1..N run every test exactly once`, async () => {
      const total = Number(SHARD.exec(step.run)[1]);
      const args = step.run
        .replace(/^pnpm ux:capture\s*/, "")
        .replace(SHARD, "")
        .split(/\s+/)
        .filter(Boolean);
      const [all, ...shards] = await Promise.all([
        list(step.env, args),
        ...Array.from({ length: total }, (_, k) =>
          list(step.env, [...args, "--shard", `${k + 1}/${total}`]),
        ),
      ]);
      expect(all.length).toBeGreaterThan(0);
      expect(new Set(all).size, "test listed twice").toBe(all.length);
      for (const [k, tests] of shards.entries())
        expect(tests.length, `shard ${k + 1} is empty`).toBeGreaterThan(0);
      const union = shards.flat();
      expect(union.length, "a test runs in two shards").toBe(all.length);
      expect([...union].sort()).toEqual([...all].sort());
    }, 60_000);
  }
});
