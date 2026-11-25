// Script tests keep their git in their own temp repositories even when the caller's
// environment points git at another one (#589): `git rebase --exec "pnpm check"` once set
// core.bare=true and created a branch `pr` in the real repository. The suites that run git
// go through a child Vitest with GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE on a sentinel
// repository in a temp folder, which must come out unchanged. Never the real repository.
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { cleanGitEnv } from "./support/cleanGitEnv.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const VITEST = join(ROOT, "node_modules/vitest/vitest.mjs");
// Every script test that runs git in a temp repository (checked below). Such a suite runs
// its git with support/cleanGitEnv.mjs.
const GIT_SUITES = ["scripts/__tests__/changelog-check.test.mjs"];

const tmp = mkdtempSync(join(tmpdir(), "git-env-isolation-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const git = (dir, ...args) =>
  execFileSync("git", ["-C", dir, "-c", "commit.gpgsign=false", ...args], {
    encoding: "utf8",
    env: cleanGitEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });

function sentinel(name) {
  const dir = join(tmp, name);
  execFileSync("git", ["init", "-q", "-b", "main", dir], {
    env: cleanGitEnv(),
    stdio: "ignore",
  });
  writeFileSync(join(dir, "sentinel.txt"), "sentinel\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "sentinel");
  return dir;
}

/** What a stray git call would change: the config (core.bare), the refs and HEAD. */
const state = (dir) => ({
  config: readFileSync(join(dir, ".git/config"), "utf8"),
  refs: git(dir, "for-each-ref", "--format=%(refname) %(objectname)"),
  head: readFileSync(join(dir, ".git/HEAD"), "utf8"),
});

describe("script tests that run git, with GIT_DIR on another repository", () => {
  it.each([
    ["GIT_DIR alone", (dir) => ({ GIT_DIR: join(dir, ".git") })],
    [
      "GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE",
      (dir) => ({
        GIT_DIR: join(dir, ".git"),
        GIT_WORK_TREE: dir,
        GIT_INDEX_FILE: join(dir, ".git/index"),
      }),
    ],
  ])(
    "leave that repository unchanged (%s)",
    (name, vars) => {
      const dir = sentinel(name.replace(/\W+/g, "-"));
      const before = state(dir);
      const r = spawnSync(
        process.execPath,
        [VITEST, "run", ...GIT_SUITES, "--maxWorkers=1"],
        {
          cwd: ROOT,
          encoding: "utf8",
          env: { ...cleanGitEnv(), ...vars(dir) },
        },
      );
      expect(state(dir)).toEqual(before);
      expect(r.status, r.stdout + r.stderr).toBe(0);
    },
    60_000,
  );
});

describe("the list of suites that run git", () => {
  it("names every test file that starts git itself", () => {
    const dirs = ["scripts/__tests__", "ux-capture/__tests__"];
    const runsGit = dirs.flatMap((d) =>
      readdirSync(join(ROOT, d))
        .filter((f) => /\.test\.(mjs|ts)$/.test(f))
        .map((f) => `${d}/${f}`)
        .filter((f) => f !== "scripts/__tests__/git-env-isolation.test.mjs")
        .filter((f) =>
          /\b(execFileSync|spawnSync|execFile|spawn)\(\s*"git"/.test(
            readFileSync(join(ROOT, f), "utf8"),
          ),
        ),
    );
    expect(runsGit).toEqual(GIT_SUITES);
  });
});

describe("cleanGitEnv", () => {
  it("drops every variable git itself clears before entering a submodule", () => {
    const local = git(tmp, "rev-parse", "--local-env-vars")
      .split("\n")
      .filter(Boolean);
    const env = Object.fromEntries(local.map((v) => [v, "x"]));
    const clean = cleanGitEnv({
      ...env,
      GIT_CONFIG_KEY_0: "core.bare",
      GIT_CONFIG_VALUE_0: "true",
      HOME: "/home",
    });
    expect(clean).toEqual({
      HOME: "/home",
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.invalid",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.invalid",
    });
  });
});
