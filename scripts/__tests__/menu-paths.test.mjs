// The macOS menu job's path check (owner, 2026-11-27), run as ci.yml holds it, in
// throw-away repositories: on a pull request the menu test runs only when the merge
// brings in a change to one of `MENU_PATHS`; on a push it always runs. gates.test.mjs
// pins the list and the job's shape. Git runs with cleanGitEnv (#589), never on the
// caller's repository.
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { MENU_PATHS, workflowSteps } from "../gates.mjs";
import { cleanGitEnv } from "./support/cleanGitEnv.mjs";

const ci = readFileSync(
  new URL("../../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);
const check = workflowSteps(ci).find(
  (s) => s.job === "rust-macos" && s.lines[0] === "paths=(",
);
const tmp = mkdtempSync(join(tmpdir(), "menu-paths-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
let repos = 0;

/**
 * The check's output and log on `event`. With `prFile`, HEAD is the merge of a branch
 * that changes `prFile` into a base branch that has since changed `baseFile`; without,
 * HEAD is a plain commit.
 */
function run(event, prFile, baseFile = "base.txt") {
  const dir = join(tmp, `repo-${++repos}`);
  mkdirSync(dir);
  const git = (...args) => {
    const r = spawnSync("git", ["-c", "commit.gpgsign=false", ...args], {
      cwd: dir,
      encoding: "utf8",
      env: cleanGitEnv(),
    });
    expect(r.status, r.stderr).toBe(0);
  };
  const commit = (file) => {
    mkdirSync(join(dir, dirname(file)), { recursive: true });
    writeFileSync(join(dir, file), `${file}\n`);
    git("add", "-A");
    git("commit", "-q", "-m", file);
  };
  git("init", "-q", "-b", "main");
  commit("README.md");
  if (prFile) {
    git("switch", "-q", "-c", "pr");
    commit(prFile);
    git("switch", "-q", "main");
    commit(baseFile);
    git("merge", "-q", "--no-ff", "-m", "merge", "pr");
  }
  const output = join(tmp, `output-${repos}`);
  writeFileSync(output, "");
  const r = spawnSync("bash", ["-e", "-c", check.lines.join("\n")], {
    cwd: dir,
    encoding: "utf8",
    env: { ...cleanGitEnv(), EVENT: event, GITHUB_OUTPUT: output },
  });
  expect(r.status, r.stderr).toBe(0);
  return { changed: readFileSync(output, "utf8"), log: r.stdout };
}

describe("the macOS menu job's path check", () => {
  it("is in ci.yml", () => {
    expect(check).toBeDefined();
  });

  it.each(MENU_PATHS)("runs the test when a pull request changes %s", (p) => {
    const { changed, log } = run("pull_request", p);
    expect(changed).toBe("changed=true\n");
    expect(log).toContain(`menu inputs changed, the full check runs: ${p}`);
  });

  it("skips the test, and says so, when a pull request changes none", () => {
    const { changed, log } = run("pull_request", "src/i18n/en.ts");
    expect(changed).toBe("changed=false\n");
    expect(log).toContain(
      "menu inputs: none changed, the menu test does not run",
    );
  });

  it("skips it when only the base branch changed a menu path", () => {
    const { changed } = run(
      "pull_request",
      "docs/x.md",
      "src-tauri/src/menu.rs",
    );
    expect(changed).toBe("changed=false\n");
  });

  it("always runs the test on a push", () => {
    const { changed, log } = run("push");
    expect(changed).toBe("changed=true\n");
    expect(log).toContain("menu inputs: push, the full check runs");
  });

  it("runs the test when HEAD is no merge commit", () => {
    const { changed, log } = run("pull_request");
    expect(changed).toBe("changed=true\n");
    expect(log).toContain(
      "menu inputs: HEAD is no merge commit, the full check runs",
    );
  });
});
