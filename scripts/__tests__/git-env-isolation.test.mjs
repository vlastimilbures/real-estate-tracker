// Script tests keep their git in their own temp repositories even when the caller's
// environment points git at another one (#589): git sets GIT_DIR inside
// `git rebase --exec` run in a linked worktree, and inside some hooks, and
// `git rebase --exec "pnpm check"` once set core.bare=true and created a branch `pr` in the
// real repository. The suites that run git go through a child Vitest with GIT_DIR (and
// friends) on a sentinel repository in a temp folder, which must come out unchanged.
// Never the real repository.
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { cleanGitEnv } from "./support/cleanGitEnv.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const VITEST = join(ROOT, "node_modules/vitest/vitest.mjs");
const SELF = "scripts/__tests__/git-env-isolation.test.mjs";
// Every test that starts git, or a script that runs git (checked below). Such a suite runs
// its git, and the scripts it starts, with support/cleanGitEnv.mjs.
const GIT_SUITES = ["scripts/__tests__/changelog-check.test.mjs"];
// Tests that import a script that runs git but call only its pure functions: no git runs.
const PURE_IMPORTS = {
  "scripts/__tests__/depcruise-baseline.test.mjs":
    "check-depcruise-baseline's pure functions; its git runs only from main()",
  "scripts/__tests__/size-baseline.test.mjs":
    "check-size-baseline's pure functions; its git runs only from main()",
};

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

/** A linked worktree of the sentinel; returns its gitdir (.git/worktrees/<name>). */
function linkedWorktree(dir) {
  const tree = join(tmp, `${basename(dir)}-worktree`);
  git(dir, "worktree", "add", "-q", "--detach", tree);
  return join(dir, ".git/worktrees", basename(tree));
}

/** What a stray git call would change: the config (core.bare), the refs and every HEAD
 * (the main one and each linked worktree's). */
function state(dir) {
  const worktrees = join(dir, ".git/worktrees");
  let linked = [];
  try {
    linked = readdirSync(worktrees).sort();
  } catch {
    // No linked worktree.
  }
  return {
    config: readFileSync(join(dir, ".git/config"), "utf8"),
    refs: git(dir, "for-each-ref", "--format=%(refname) %(objectname)"),
    head: readFileSync(join(dir, ".git/HEAD"), "utf8"),
    worktreeHeads: linked.map((w) =>
      readFileSync(join(worktrees, w, "HEAD"), "utf8"),
    ),
  };
}

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
    // What `git rebase --exec` in a linked worktree sets (the incident of 2026-11-25).
    [
      "GIT_DIR on a linked worktree's gitdir",
      (dir) => ({ GIT_DIR: linkedWorktree(dir) }),
    ],
  ])(
    "leave that repository unchanged (%s)",
    (name, vars) => {
      const dir = sentinel(name.replace(/\W+/g, "-"));
      const env = { ...cleanGitEnv(), ...vars(dir) };
      const before = state(dir);
      const r = spawnSync(
        process.execPath,
        [VITEST, "run", ...GIT_SUITES, "--maxWorkers=1"],
        { cwd: ROOT, encoding: "utf8", env, timeout: 50_000 },
      );
      expect(r.error).toBeUndefined();
      expect(state(dir)).toEqual(before);
      expect(r.status, r.stdout + r.stderr).toBe(0);
    },
    60_000,
  );
});

const SOURCE = /\.(c?js|mjs|tsx?)$/;
const GIT_CALL =
  /\b(exec|execSync|execFile|execFileSync|spawn|spawnSync)\(\s*[`"']git\b/;

/** Source files under `dir` (relative to ROOT), recursively, without node_modules. */
function walk(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const path = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(path);
    return SOURCE.test(e.name) ? [path] : [];
  });
}
const read = (f) => readFileSync(join(ROOT, f), "utf8");

describe("the list of suites that run git", () => {
  const isTest = (f) => f.includes("/__tests__/");
  // The scripts that run git (on the repository they start in, on purpose).
  const scripts = ["scripts", "ux-capture"]
    .flatMap(walk)
    .filter((f) => !isTest(f) && GIT_CALL.test(read(f)));
  const tests = ["scripts", "ux-capture", "src"]
    .flatMap(walk)
    .filter((f) => isTest(f) && f !== SELF);
  // A module specifier or path naming one of those scripts, e.g. "../check-changelog.mjs"
  // or "scripts/check-changelog.mjs" (after a slash, so a bare word "baseline" is no hit).
  const names = scripts.map((f) =>
    basename(f).replace(/\.(c?js|mjs|tsx?)$/, ""),
  );
  const startsScript = new RegExp(
    `/(${names.join("|")})(\\.(c?js|mjs|tsx?))?[\`"']`,
  );

  it("finds the scripts that run git", () => {
    expect(scripts).toContain("scripts/check-changelog.mjs");
    expect(scripts).toContain("ux-capture/baseline.ts");
  });

  it("names every test file that starts git or a script that runs it", () => {
    const runsGit = tests.filter((f) => {
      const text = read(f);
      return GIT_CALL.test(text) || startsScript.test(text);
    });
    expect(runsGit.sort()).toEqual(
      [...GIT_SUITES, ...Object.keys(PURE_IMPORTS)].sort(),
    );
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
