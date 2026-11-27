// scripts/release-macos.sh (ADR 0009, ADR 0063) read as text: a release build needs macOS,
// Rust and Xcode tools, so this pins only what docs/release.md promises about it: strict
// mode, network use only through the steps the doc names (the checks, with their
// dependency audits, and the build), and each verification step.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SCRIPT = "scripts/release-macos.sh";
const text = readFileSync(`${ROOT}/${SCRIPT}`, "utf8");
const doc = readFileSync(`${ROOT}/docs/release.md`, "utf8");
/** The script's commands: no comment lines, no blank lines. */
const code = text
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

describe("release-macos.sh", () => {
  it("is valid bash", () => {
    const r = spawnSync("bash", ["-n", SCRIPT], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(r.status, r.stderr).toBe(0);
  });

  it("sets strict mode before any other command", () => {
    expect(code[0]).toBe("set -euo pipefail");
  });

  it("refuses a dirty tree and a version mismatch before it builds", () => {
    const build = code.findIndex((l) => l.startsWith("pnpm tauri build"));
    const clean = code.findIndex((l) => l.includes("git status --porcelain"));
    const versions = code.findIndex((l) =>
      l.includes('"$pkg_version" == "$cargo_version"'),
    );
    expect(clean).toBeGreaterThan(-1);
    expect(versions).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(Math.max(clean, versions));
  });

  it("runs pnpm only for the release checks and the build", () => {
    const pnpm = code.filter((l) => /\bpnpm\b/.test(l));
    expect(pnpm).toEqual([
      "pnpm check:release",
      'pnpm tauri build --target "$TARGET"',
    ]);
    // The checks (with their two dependency audits) are skipped only on request.
    expect(text).toMatch(
      /if \[\[ "\$\{1:-\}" != "--skip-checks" \]\]; then\s+step "Checks"\s+pnpm check:release\s+fi/,
    );
  });

  it("uses no network tool, git remote, publish or upload", () => {
    const network =
      /\b(curl|wget|nc|ssh|scp|rsync|gh|npm|npx|xcrun|notarytool|altool|stapler)\b|\bgit\s+(push|fetch|pull|clone|remote)\b|\bpnpm\s+(install|add|publish|dlx)\b/;
    expect(code.filter((l) => network.test(l))).toEqual([]);
    // Downloads the Rust target only when it is missing (not in docs/release.md).
    expect(code.filter((l) => /\brustup\b/.test(l))).toEqual([
      'rustup target list --installed | grep -qx "$TARGET" || rustup target add "$TARGET"',
    ]);
  });

  it("signs ad hoc only: no signing identity, no notarisation", () => {
    expect(code.filter((l) => /codesign\b.*(--sign|-s\b)/.test(l))).toEqual([]);
  });

  // Each check docs/release.md step 6 lists, with its line in the script.
  it.each([
    [
      "no sql.js in the frontend bundle",
      "sql.js",
      "grep -rlE 'sql-wasm|initSqlJs' dist/assets",
    ],
    [
      "codesign --verify --deep --strict --verbose=2",
      "codesign --verify --deep --strict --verbose=2",
      'codesign --verify --deep --strict --verbose=2 "$APP"',
    ],
    ["Signature=adhoc", "Signature=adhoc", "grep -q '^Signature=adhoc'"],
    ["the hardened runtime flag", "`runtime`", "grep -q 'flags=.*runtime'"],
    ["arm64 only", "`arm64` only", '[[ "$archs" == arm64 ]]'],
    [
      "LSMinimumSystemVersion 13.0",
      "`LSMinimumSystemVersion` is `13.0`",
      '[[ "$min_os" == 13.0 ]]',
    ],
  ])("checks %s, as docs/release.md says", (_, inDoc, inScript) => {
    expect(doc).toContain(inDoc);
    const line = code.find((l) => l.includes(inScript));
    expect(line, inScript).toBeDefined();
  });

  it("fails the release when a check fails", () => {
    for (const check of [
      "Signature=adhoc",
      "flags=.*runtime",
      "== arm64",
      "== 13.0",
    ]) {
      expect(code.find((l) => l.includes(check))).toMatch(/\|\| fail /);
    }
  });
});
