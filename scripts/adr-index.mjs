// Generates the ADR index table in docs/adr/README.md from the ADR headers and checks
// the headers (ADR 0152): heading, Status, Date, links to existing ADRs, and both sides of
// every Amends / Amended-by and Supersedes / Superseded-by link.
// `pnpm adr:index` writes the index; `pnpm adr:check` (CI) fails on errors or drift.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { format, resolveConfig } from "prettier";

const DIR = fileURLToPath(new URL("../docs/adr/", import.meta.url));
const START = "<!-- adr-index:start -->";
const END = "<!-- adr-index:end -->";
const STATUS = /^(Proposed|Accepted|Rejected|Superseded by (0\d{3}))$/;
// ADR numbers stay below 1000, so a 4-digit number starting with 0 is an ADR, not a year.
const ADR_REF = /\b0\d{3}\b/g;
const ID = /\b(?:DR|UX|D|J|Q|F)-\d+\b|(?<!PR )#\d+\b/g;

const unique = (xs) => [...new Set(xs)];

/** Header fields of one ADR file: the bullets up to the first `## `, continuation lines joined. */
function headerFields(lines) {
  const fields = [];
  for (const line of lines.slice(1)) {
    if (line.startsWith("## ")) break;
    const m = line.match(/^- ([A-Za-z ]+):\s*(.*)$/);
    if (m) fields.push({ key: m[1], value: m[2] });
    else if (/^\s+\S/.test(line) && fields.length > 0)
      fields[fields.length - 1].value += ` ${line.trim()}`;
  }
  return fields;
}

/** Parses one ADR file. `errors` holds problems local to the file. */
export function parseAdr(file, text) {
  const number = file.slice(0, 4);
  const lines = text.split("\n");
  const errors = [];
  const heading = lines[0].match(/^# (\d{4})\. (.+)$/);
  if (!heading || heading[1] !== number)
    errors.push(`${file}: the heading must be "# ${number}. Title"`);
  const fields = headerFields(lines);
  const values = (key) =>
    fields.filter((f) => f.key === key).map((f) => f.value);
  const refs = (key) =>
    unique(values(key).flatMap((v) => v.match(ADR_REF) ?? [])).filter(
      (n) => n !== number,
    );

  const status = values("Status")[0];
  const s = status?.match(STATUS);
  if (status === undefined) errors.push(`${file}: no Status line`);
  else if (!s)
    errors.push(
      `${file}: Status "${status}" is not Proposed, Accepted, Rejected or Superseded by NNNN`,
    );
  if (values("Date").length === 0) errors.push(`${file}: no Date line`);

  const followUps = [...text.matchAll(/^- \*\*(D-\d+)\*\*/gm)].map((m) => m[1]);
  const ids = unique([
    ...["Source IDs", "Source", "Amended"]
      .flatMap(values)
      .flatMap((v) => v.match(ID) ?? []),
    ...followUps,
  ]);

  return {
    number,
    file,
    title: heading ? heading[2] : "",
    status: status ?? "",
    supersededBy: s?.[2] ?? null,
    amends: refs("Amends"),
    amendedBy: refs("Amended by"),
    supersedes: refs("Supersedes"),
    ids,
    errors,
  };
}

/** All errors across the ADR set: duplicates, then links, then per-file problems. */
export function checkAdrs(adrs) {
  const errors = [];
  const byNumber = new Map();
  for (const a of adrs) {
    const seen = byNumber.get(a.number);
    if (seen) errors.push(`${a.number} is used twice: ${seen.file}, ${a.file}`);
    else byNumber.set(a.number, a);
  }
  const link = (a, targets, verb, paired, other) => {
    for (const t of targets) {
      const b = byNumber.get(t);
      if (!b) errors.push(`${a.number} ${verb} ${t}, which does not exist`);
      else if (!paired(b))
        errors.push(`${a.number} ${verb} ${t}, but ${t} ${other}`);
    }
  };
  for (const a of adrs) {
    link(
      a,
      a.amends,
      "amends",
      (b) => b.amendedBy.includes(a.number),
      `has no Amended by ${a.number}`,
    );
    link(
      a,
      a.amendedBy,
      "says Amended by",
      (b) => b.amends.includes(a.number),
      `has no Amends ${a.number}`,
    );
    link(
      a,
      a.supersedes,
      "supersedes",
      (b) => b.supersededBy === a.number,
      `is not Superseded by ${a.number}`,
    );
    link(
      a,
      a.supersededBy ? [a.supersededBy] : [],
      "is Superseded by",
      (b) => b.supersedes.includes(a.number),
      `has no Supersedes ${a.number}`,
    );
  }
  return [...errors, ...adrs.flatMap((a) => a.errors)];
}

/** The index table, one row per ADR in number order (unformatted Markdown). */
export function renderIndex(adrs) {
  const cell = (s) => s.replaceAll("|", "\\|");
  const rows = [...adrs]
    .sort((a, b) => a.number.localeCompare(b.number))
    .map((a) => {
      const status =
        a.amendedBy.length > 0
          ? `${a.status} · amended by ${a.amendedBy.join(", ")}`
          : a.status;
      return `| [${a.number}](${a.file}) | ${cell(a.title)} | ${status} | ${a.ids.join(", ")} |`;
    });
  return [
    "| ADR | Title | Status | IDs |",
    "| --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

/** `readme` with the text between the index markers replaced by `table`. */
export function replaceIndex(readme, table) {
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start < 0 || end < start)
    throw new Error(`README needs ${START} … ${END} around the index table`);
  return `${readme.slice(0, start + START.length)}\n\n${table}\n\n${readme.slice(end)}`;
}

/** Reads `dir`, checks it and builds the README it should have (Prettier-formatted). */
export async function generateReadme(dir = DIR) {
  const path = `${dir}README.md`;
  const adrs = readdirSync(dir)
    .filter((f) => /^\d{4}-.*\.md$/.test(f))
    .sort()
    .map((f) => parseAdr(f, readFileSync(`${dir}${f}`, "utf8")));
  const current = readFileSync(path, "utf8");
  const raw = replaceIndex(current, renderIndex(adrs));
  const expected = await format(raw, {
    ...(await resolveConfig(path)),
    filepath: path,
  });
  return { errors: checkAdrs(adrs), current, expected, path };
}

async function main() {
  const check = process.argv.includes("--check");
  const { errors, current, expected, path } = await generateReadme();
  for (const e of errors) console.error(e);
  if (check) {
    if (current !== expected)
      console.error(
        "docs/adr/README.md index is out of date: run pnpm adr:index",
      );
    process.exit(errors.length > 0 || current !== expected ? 1 : 0);
  }
  if (current !== expected) writeFileSync(path, expected);
  console.log(
    current === expected ? "ADR index is current" : "ADR index written",
  );
  process.exit(errors.length > 0 ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
