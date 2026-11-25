// The changelog check on pull requests (#461): the rules on synthetic input, then the CLI
// on a throw-away git repository, including a shallow clone of a merge commit as CI has.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  changedAdrs,
  adrStatus,
  optOut,
  unreleased,
  verdict,
} from "../check-changelog.mjs";
import { cleanGitEnv } from "./support/cleanGitEnv.mjs";

const changelog = (entries) =>
  [
    "# Changelog",
    "",
    "## [Unreleased]",
    "",
    "### Release blockers",
    "",
    "None.",
    "",
    ...entries,
    "",
    "## [1.5.0] - 2026-10-14",
    "",
    "- Old entry (ADR 0194, #317).",
    "",
  ].join("\n");

const accepted = (number) => ({
  number,
  file: `docs/adr/${number}-x.md`,
  status: "Accepted",
});
const base = { adrs: [], wordingAdded: false, before: changelog([]), body: "" };

describe("unreleased", () => {
  it("is the section up to the next release heading", () => {
    const s = unreleased(changelog(["- New (ADR 0230)."]));
    expect(s).toContain("ADR 0230");
    expect(s).not.toContain("ADR 0194");
    expect(s.startsWith("## [Unreleased]")).toBe(true);
  });

  it("runs to the end without a release below, and is empty without the heading", () => {
    expect(unreleased("## [Unreleased]\n\n- a\n")).toBe(
      "## [Unreleased]\n\n- a\n",
    );
    expect(unreleased("# Changelog\n")).toBe("");
  });
});

describe("changedAdrs", () => {
  it("takes added and modified ADR files", () => {
    expect(
      changedAdrs([
        "A\tdocs/adr/0230-new-thing.md",
        "M\tdocs/adr/0229-old.md",
        "D\tdocs/adr/0228-gone.md",
        "A\tdocs/adr/README.md",
        "A\tdocs/decisions/0232-x.md",
        "A\tsrc/x.ts",
      ]),
    ).toEqual([
      { number: "0230", file: "docs/adr/0230-new-thing.md", change: "A" },
      { number: "0229", file: "docs/adr/0229-old.md", change: "M" },
    ]);
  });
});

describe("adrStatus", () => {
  it("reads the Status header line", () => {
    expect(adrStatus("# 0230. X\n\n- Status: Proposed\n- Date: x\n")).toBe(
      "Proposed",
    );
    expect(adrStatus("# 0230. X\n")).toBe("");
  });
});

describe("optOut", () => {
  it("reads the reason of a Changelog: none line", () => {
    expect(optOut("Summary\n\nChangelog: none (CI only, ADR 0239)\n")).toEqual({
      reason: "CI only, ADR 0239",
    });
    expect(optOut("changelog: None (tooling)")).toEqual({ reason: "tooling" });
  });

  it("is bare without a reason, and absent otherwise", () => {
    expect(optOut("Changelog: none")).toEqual({ reason: null });
    expect(optOut("Changelog: none ()")).toEqual({ reason: null });
    expect(optOut("The changelog: none of it")).toBeNull();
    expect(optOut("")).toBeNull();
    expect(optOut(undefined)).toBeNull();
  });
});

describe("verdict", () => {
  it("passes an accepted ADR cited in [Unreleased], across a line break too", () => {
    const after = changelog(["- New thing (ADR", "  0230, #1)."]);
    expect(verdict({ ...base, adrs: [accepted("0230")], after })).toEqual({
      ok: true,
      errors: [],
    });
  });

  it("fails an accepted ADR that [Unreleased] does not cite", () => {
    const r = verdict({
      ...base,
      adrs: [accepted("0230"), accepted("0194")],
      after: changelog(["- Other (ADR 0231)."]),
    });
    expect(r.ok).toBe(false);
    // Cited only under an older release does not count.
    expect(r.errors).toEqual([
      expect.stringContaining('does not cite "ADR 0230"'),
      expect.stringContaining('does not cite "ADR 0194"'),
    ]);
  });

  it("counts a delegated acceptance as accepted", () => {
    const adr = {
      ...accepted("0230"),
      status: "Accepted (delegated, owner review pending)",
    };
    expect(verdict({ ...base, adrs: [adr], after: changelog([]) }).ok).toBe(
      false,
    );
  });

  it("exempts Proposed, Rejected and superseded ADRs", () => {
    const adrs = ["Proposed", "Rejected", "Superseded by 0231"].map(
      (status, i) => ({ ...accepted(`023${i}`), status }),
    );
    expect(verdict({ ...base, adrs, after: changelog([]) }).ok).toBe(true);
  });

  it("needs a citation when the PR changes a Status to Accepted, not when it was", () => {
    const now = (before) => ({ ...accepted("0229"), change: "M", before });
    const after = changelog([]);
    expect(verdict({ ...base, adrs: [now("Proposed")], after }).ok).toBe(false);
    expect(verdict({ ...base, adrs: [now("")], after }).ok).toBe(false);
    expect(verdict({ ...base, adrs: [now("Accepted")], after }).ok).toBe(true);
    expect(
      verdict({
        ...base,
        adrs: [now("Accepted (delegated, owner review pending)")],
        after,
      }).ok,
    ).toBe(true);
  });

  it("needs a changed [Unreleased] when the wording log has a new entry", () => {
    const same = verdict({ ...base, wordingAdded: true, after: changelog([]) });
    expect(same.ok).toBe(false);
    expect(same.errors[0]).toContain("wording.md");
    const changed = changelog(["- Clearer label for undrawn debt."]);
    expect(verdict({ ...base, wordingAdded: true, after: changed }).ok).toBe(
      true,
    );
  });

  it("lets a reasoned opt-out pass and fails a bare one", () => {
    const missing = { ...base, adrs: [accepted("0230")], after: changelog([]) };
    expect(verdict({ ...missing, body: "Changelog: none (CI only)" })).toEqual({
      ok: true,
      errors: [],
      optedOut: "CI only",
    });
    const bare = verdict({ ...missing, body: "Changelog: none" });
    expect(bare.ok).toBe(false);
    expect(bare.errors[0]).toContain("needs a reason");
    expect(bare.errors).toHaveLength(2);
    expect(
      verdict({ ...base, after: changelog([]), body: "Changelog: none" }).ok,
    ).toBe(false);
  });

  it("passes a PR with nothing to check", () => {
    expect(verdict({ ...base, after: changelog([]) }).ok).toBe(true);
  });
});

describe("the CLI on a git repository", () => {
  const script = fileURLToPath(
    new URL("../check-changelog.mjs", import.meta.url),
  );
  const temps = [];
  const tempDir = (prefix) => {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    temps.push(dir);
    return dir;
  };
  afterAll(() => {
    for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  });
  // cleanGitEnv: git and the CLI find the temp repository from cwd, never the caller's
  // GIT_DIR (#589, git-env-isolation.test.mjs).
  const git = (cwd, ...args) =>
    execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
      cwd,
      encoding: "utf8",
      env: cleanGitEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
  const write = (dir, file, text) => {
    mkdirSync(join(dir, file, ".."), { recursive: true });
    writeFileSync(join(dir, file), text);
  };
  const check = (cwd, base, body = "") =>
    spawnSync(process.execPath, [script, "--base", base], {
      cwd,
      encoding: "utf8",
      env: { ...cleanGitEnv(), PR_BODY: body },
    });
  const adr = (status) =>
    `# 0230. New thing\n\n- Status: ${status}\n- Date: 2026-11-17\n`;

  function repo() {
    const dir = tempDir("changelog-check-");
    git(dir, "init", "-q", "-b", "main");
    write(dir, "CHANGELOG.md", changelog([]));
    write(dir, "docs/decisions/wording.md", "# Wording\n");
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "base");
    git(dir, "checkout", "-q", "-b", "pr");
    return dir;
  }

  it("fails an uncited accepted ADR, passes once cited or opted out", () => {
    const dir = repo();
    write(dir, "docs/adr/0230-new-thing.md", adr("Accepted"));
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "adr");

    const fail = check(dir, "main");
    expect(fail.status).toBe(1);
    expect(fail.stderr).toContain('does not cite "ADR 0230"');
    expect(check(dir, "main", "Changelog: none (CI only)").status).toBe(0);
    expect(check(dir, "main", "Changelog: none").status).toBe(1);

    write(dir, "CHANGELOG.md", changelog(["- New thing (ADR 0230)."]));
    git(dir, "commit", "-q", "-am", "changelog");
    const pass = check(dir, "main");
    expect(pass.status).toBe(0);
    expect(pass.stdout).toContain(
      "added docs/adr/0230-new-thing.md (Accepted)",
    );
  });

  it("ignores a proposed ADR and checks the wording log", () => {
    const dir = repo();
    write(dir, "docs/adr/0230-new-thing.md", adr("Proposed"));
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "adr");
    expect(check(dir, "main").status).toBe(0);

    write(dir, "docs/decisions/wording.md", "# Wording\n\n### 2026-11-17\n");
    git(dir, "commit", "-q", "-am", "wording");
    expect(check(dir, "main").stderr).toContain("wording.md has a new entry");
  });

  it("counts a Status changed to Accepted, and a renamed ADR under its new number", () => {
    const dir = repo();
    write(dir, "docs/adr/0230-new-thing.md", adr("Proposed"));
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "proposed");
    git(dir, "checkout", "-q", "-b", "accept");
    write(dir, "docs/adr/0230-new-thing.md", adr("Accepted"));
    git(dir, "commit", "-q", "-am", "accept");
    const r = check(dir, "pr");
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(
      "accepted docs/adr/0230-new-thing.md (Proposed → Accepted)",
    );
    expect(r.stderr).toContain('does not cite "ADR 0230"');

    // An accepted ADR renumbered (content unchanged) is a new number to cite.
    git(dir, "checkout", "-q", "-b", "renumber");
    git(dir, "mv", "docs/adr/0230-new-thing.md", "docs/adr/0231-new-thing.md");
    git(dir, "commit", "-q", "-m", "renumber");
    const moved = check(dir, "accept");
    expect(moved.stdout).toContain(
      "added docs/adr/0231-new-thing.md (Accepted)",
    );
    expect(moved.stderr).toContain('does not cite "ADR 0231"');
  });

  // CI checks out the pull request's merge commit with depth 2: HEAD^1 is the base.
  it("works on a shallow clone of a merge commit with --base HEAD^1", () => {
    const dir = repo();
    write(dir, "docs/adr/0230-new-thing.md", adr("Accepted"));
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "adr");
    git(dir, "checkout", "-q", "main");
    write(dir, "other.txt", "main moved on\n");
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "main");
    git(dir, "merge", "-q", "--no-ff", "-m", "merge", "pr");

    const clone = tempDir("changelog-clone-");
    git(clone, "clone", "-q", "--depth", "2", `file://${dir}`, ".");
    const r = check(clone, "HEAD^1");
    expect(r.stdout).toContain("added docs/adr/0230-new-thing.md");
    expect(r.stdout).not.toContain("other.txt");
    expect(r.status).toBe(1);
  });
});
