// The Cargo.lock half of scripts/check-vendored-sqlx-sqlite.sh (ADR 0196) on edited
// copies of the real src-tauri/Cargo.lock: the build must resolve sqlx-sqlite to the
// vendored path copy, and the check must fail before any download when it does not.
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SCRIPT = join(ROOT, "scripts/check-vendored-sqlx-sqlite.sh");
const REAL = readFileSync(join(ROOT, "src-tauri/Cargo.lock"), "utf8");
const DIR = mkdtempSync(join(tmpdir(), "sqlx-lock-"));
afterAll(() => rmSync(DIR, { recursive: true, force: true }));
const REGISTRY =
  'source = "registry+https://github.com/rust-lang/crates.io-index"';
const VENDORED = '[[package]]\nname = "sqlx-sqlite"\nversion = "0.8.6"\n';
const MESSAGE =
  "Cargo.lock does not use the vendored sqlx-sqlite 0.8.6 (ADR 0196)";

/** The vendored entry as a block, from `[[package]]` to the blank line after it. */
function vendoredBlock() {
  const start = REAL.indexOf(VENDORED);
  return REAL.slice(start, REAL.indexOf("\n\n", start) + 2);
}

let n = 0;
function check(lock, { args = ["--lock-only"], env = {} } = {}) {
  const file = join(DIR, `Cargo-${n++}.lock`);
  writeFileSync(file, lock);
  const r = spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, SQLX_CARGO_LOCK: file, ...env },
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

describe("check-vendored-sqlx-sqlite.sh lock check", () => {
  it("the real lock has the vendored entry once", () => {
    expect(REAL.split(VENDORED)).toHaveLength(2);
    expect(vendoredBlock()).not.toContain("source = ");
  });

  it("passes the real Cargo.lock", () => {
    const r = check(REAL);
    expect(r.status).toBe(0);
    expect(r.out).toContain("uses the vendored sqlx-sqlite 0.8.6");
  });

  it("fails crates.io's 0.8.7 in place of the patch", () => {
    const r = check(
      REAL.replace(
        VENDORED,
        `[[package]]\nname = "sqlx-sqlite"\nversion = "0.8.7"\n${REGISTRY}\n`,
      ),
    );
    expect(r.status).toBe(1);
    expect(r.err).toContain(MESSAGE);
    expect(r.err).toContain('[[package]] version = "0.8.7" (registry)');
  });

  it("fails crates.io's 0.8.6 in place of the patch", () => {
    const r = check(REAL.replace(VENDORED, `${VENDORED}${REGISTRY}\n`));
    expect(r.status).toBe(1);
    expect(r.err).toContain('[[package]] version = "0.8.6" (registry)');
  });

  it("fails a registry entry beside the vendored one", () => {
    const extra = vendoredBlock().replace(
      'version = "0.8.6"\n',
      `version = "0.8.5"\n${REGISTRY}\n`,
    );
    const r = check(REAL.replace(VENDORED, `${extra}${VENDORED}`));
    expect(r.status).toBe(1);
    expect(r.err).toContain('[[package]] version = "0.8.6" (path)');
    expect(r.err).toContain('[[package]] version = "0.8.5" (registry)');
  });

  it("fails an unused patch", () => {
    const r = check(
      `${REAL}\n[[patch.unused]]\nname = "sqlx-sqlite"\nversion = "0.8.6"\n`,
    );
    expect(r.status).toBe(1);
    expect(r.err).toContain('[[patch.unused]] version = "0.8.6"');
  });

  it("fails a lock without sqlx-sqlite", () => {
    const r = check(REAL.replace(vendoredBlock(), ""));
    expect(r.status).toBe(1);
    expect(r.err).toContain("no sqlx-sqlite entry");
  });

  it("checks the lock before any download", () => {
    // A `curl` that would show the network was reached: the check must stop first.
    const bin = join(DIR, "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "curl"), "#!/bin/sh\nexit 99\n");
    chmodSync(join(bin, "curl"), 0o755);
    const r = check(REAL.replace(vendoredBlock(), ""), {
      args: [],
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
    expect(r.status).toBe(1);
    expect(r.err).toContain(MESSAGE);
  });
});
