// Changelog check on pull requests (#461). An ADR marks a user-visible change (ADR 0001),
// and a user-visible change gets a CHANGELOG.md `[Unreleased]` entry (CONTRIBUTING.md):
//   1. every ADR file the PR adds with a Status starting "Accepted", or whose Status it
//      changes to "Accepted …", is cited as "ADR NNNN" in the head's `[Unreleased]`
//      (Proposed and Rejected ADRs are exempt). Renames count as a delete and an add
//      (`--no-renames`), so a renumbered ADR is cited under its new number;
//   2. a PR that adds to docs/decisions/wording.md (a copy change, ADR 0152) changes
//      `[Unreleased]`.
// A PR with nothing to say opts out with a line `Changelog: none (reason)` in its body,
// read from the PR_BODY environment variable; a bare opt-out without a reason fails.
//
//   node scripts/check-changelog.mjs --base <ref>   (CI: --base HEAD^1 on the merge ref)
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

const CHANGELOG = "CHANGELOG.md";
const WORDING = "docs/decisions/wording.md";
const ADR_FILE = /^docs\/adr\/(0\d{3})-[a-z0-9-]+\.md$/;

/** The `## [Unreleased]` section of a changelog, up to the next release heading. */
export function unreleased(text) {
  const start = text.search(/^## \[Unreleased\]/m);
  if (start < 0) return "";
  const rest = text.slice(start);
  const next = rest.slice(1).search(/^## \[/m);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

/** ADR files added (A) or modified (M), from `git diff --name-status --no-renames`
 * lines: `[{ number, file, change }]`. */
export function changedAdrs(lines) {
  return lines
    .map((l) => l.split("\t"))
    .filter(([change]) => change === "A" || change === "M")
    .map(([change, file]) => ({ change, file, m: file?.match(ADR_FILE) }))
    .filter(({ m }) => m)
    .map(({ change, file, m }) => ({ number: m[1], file, change }));
}

const accepted = (status) => (status ?? "").startsWith("Accepted");

/** The PR makes this ADR accepted: added as accepted, or its Status changed to it. */
export const becomesAccepted = (a) => accepted(a.status) && !accepted(a.before);

/** The Status of an ADR file, or "" when it has none. */
export function adrStatus(text) {
  return text.match(/^- Status:\s*(.*)$/m)?.[1].trim() ?? "";
}

/** The opt-out line of a PR body: `null` if absent, else `{ reason }` (null if bare). */
export function optOut(body) {
  const m = (body ?? "").match(/^[ \t]*Changelog:[ \t]*none\b(.*)$/im);
  if (!m) return null;
  const reason = m[1].match(/^\s*\(([^)]*)\)/)?.[1].trim();
  return { reason: reason || null };
}

/** `[Unreleased]` cites `number` as "ADR NNNN", a line break allowed between the two. */
const cites = (section, number) =>
  new RegExp(`\\bADR\\s+${number}\\b`).test(section);

/**
 * The check's result. `adrs`: changed ADRs with their `status` at head and `before` at
 * base ("" for an added file); `wordingAdded`: the PR adds
 * lines to the wording log; `before` / `after`: CHANGELOG.md at base and head.
 */
export function verdict({ adrs, wordingAdded, before, after, body }) {
  const out = optOut(body);
  if (out?.reason) return { ok: true, errors: [], optedOut: out.reason };
  const errors = [];
  if (out)
    errors.push(
      '"Changelog: none" needs a reason in parentheses: "Changelog: none (reason)"',
    );
  const section = unreleased(after);
  for (const a of adrs)
    if (becomesAccepted(a) && !cites(section, a.number))
      errors.push(
        `${a.file} is accepted, but CHANGELOG.md [Unreleased] does not cite "ADR ${a.number}"`,
      );
  if (wordingAdded && unreleased(before) === section)
    errors.push(
      `${WORDING} has a new entry, but CHANGELOG.md [Unreleased] did not change`,
    );
  return { ok: errors.length === 0, errors };
}

const git = (args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

/** A file at a commit, or "" when it does not exist there. */
function show(ref, file) {
  try {
    return git(["show", `${ref}:${file}`]);
  } catch {
    return "";
  }
}

/** Reads the PR from git: its changed ADRs, the wording log, the changelog at both ends. */
export function gather(base) {
  const from = git(["merge-base", base, "HEAD"]).trim();
  const lines = git(["diff", "--name-status", "--no-renames", from, "HEAD"])
    .split("\n")
    .filter(Boolean);
  const adrs = changedAdrs(lines).map((a) => ({
    ...a,
    status: adrStatus(show("HEAD", a.file)),
    before: a.change === "A" ? "" : adrStatus(show(from, a.file)),
  }));
  const added = git(["diff", "--numstat", from, "HEAD", "--", WORDING]);
  return {
    adrs,
    wordingAdded: Number(added.split("\t")[0]) > 0,
    before: show(from, CHANGELOG),
    after: show("HEAD", CHANGELOG),
  };
}

function main(args) {
  const i = args.indexOf("--base");
  const base = i >= 0 ? args[i + 1] : "origin/main";
  if (!base) {
    console.error("usage: check-changelog.mjs --base <ref>");
    return 2;
  }
  const facts = gather(base);
  const r = verdict({ ...facts, body: process.env.PR_BODY ?? "" });
  for (const a of facts.adrs)
    if (a.change === "A")
      console.log(`added ${a.file} (${a.status || "no Status"})`);
    else if (becomesAccepted(a))
      console.log(
        `accepted ${a.file} (${a.before || "no Status"} → ${a.status})`,
      );
  if (r.optedOut) console.log(`Changelog: none (${r.optedOut})`);
  for (const e of r.errors) console.error(e);
  if (r.ok && !r.optedOut)
    console.log(`changelog check passed against ${base}`);
  if (!r.ok)
    console.error(
      'Add an entry under [Unreleased], or opt out with "Changelog: none (reason)" in the PR body.',
    );
  return r.ok ? 0 : 1;
}

// realpath: a symlinked checkout must still run the CLI, not silently do nothing.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
)
  process.exit(main(process.argv.slice(2)));
