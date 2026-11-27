// scripts/release-macos.sh (ADR 0009, ADR 0063) read as text: a release build needs macOS,
// Rust and Xcode tools, so this pins only what docs/release.md promises about it: strict
// mode, network use only through the steps the doc names (the checks, with their
// dependency audits, and the build), and each verification step. The Rust target check
// also runs for real, against a stub `rustup` on PATH (no git is involved).
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

/** The installed-target check, as the script defines it: an exact line match, no download. */
const REQUIRE_TARGET =
  'require_target() { grep -qx "$TARGET" <<<"$(rustup target list --installed)" || fail "Rust target $TARGET is not installed. Run once: rustup target add $TARGET"; }';

/** Runs the script's own `fail` and `require_target` lines with a stub `rustup` that
 * lists `installed`, in a temp folder that is removed afterwards. */
function runRequireTarget(installed) {
  const dir = mkdtempSync(join(tmpdir(), "release-macos-"));
  try {
    const list = installed.map((t) => `'${t}'`).join(" ");
    writeFileSync(
      join(dir, "rustup"),
      [
        "#!/bin/sh",
        '[ "$*" = "target list --installed" ] || { echo "unexpected: rustup $*" >&2; exit 9; }',
        `printf '%s\\n' ${list}`,
        "",
      ].join("\n"),
    );
    chmodSync(join(dir, "rustup"), 0o755);
    const fns = code.filter(
      (l) => l.startsWith("fail()") || l.startsWith("require_target()"),
    );
    expect(fns).toHaveLength(2);
    const snippet = [
      "set -euo pipefail",
      "TARGET=aarch64-apple-darwin",
      ...fns,
      "require_target",
      "echo ok",
    ].join("\n");
    return spawnSync("bash", ["-c", snippet], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ""}` },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

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
    // rustup only lists the installed targets; it never downloads one (docs/release.md).
    expect(code.filter((l) => /\brustup\b/.test(l))).toEqual([REQUIRE_TARGET]);
  });

  it("never runs rustup target add", () => {
    // Only the failure message names it, inside quotes, for the owner to run.
    const runs = /(^|[;&|({]\s*)rustup\s+target\s+add\b/;
    expect(code.filter((l) => runs.test(l))).toEqual([]);
  });

  it("stops on a missing Rust target before any build step", () => {
    const defined = code.indexOf(REQUIRE_TARGET);
    const call = code.indexOf("require_target");
    const checks = code.indexOf("pnpm check:release");
    const build = code.findIndex((l) => l.startsWith("pnpm tauri build"));
    expect(defined).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(defined);
    expect(call).toBeLessThan(checks);
    expect(call).toBeLessThan(build);
  });

  it("passes the target check when the target is installed", () => {
    const r = runRequireTarget(["x86_64-apple-darwin", "aarch64-apple-darwin"]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe("ok\n");
  });

  it("fails the target check, naming the command to run, when it is missing", () => {
    // A longer name that starts with the target is not a match: the line must equal it.
    const r = runRequireTarget([
      "x86_64-apple-darwin",
      "aarch64-apple-darwin-extra",
    ]);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe(
      "release: Rust target aarch64-apple-darwin is not installed. Run once: rustup target add aarch64-apple-darwin\n",
    );
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
