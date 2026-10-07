// `pnpm adr:index` / `pnpm adr:check` on synthetic ADRs, plus the real docs/adr (ADR 0152).
import { describe, expect, it } from "vitest";
import {
  checkAdrs,
  generateReadme,
  parseAdr,
  renderIndex,
  replaceIndex,
} from "../adr-index.mjs";

/** A synthetic ADR file: `header` lines go between the heading and `## Context`. */
function adr(number, title, header) {
  return [
    `# ${number}. ${title}`,
    "",
    ...header,
    "",
    "## Context",
    "",
    "Text.",
    "",
  ].join("\n");
}

const parse = (number, slug, title, header) =>
  parseAdr(`${number}-${slug}.md`, adr(number, title, header));

describe("parseAdr", () => {
  it("reads number, title, status and the links, continuation lines included", () => {
    const a = parse("0120", "tranche", "Tranche on a recast payment", [
      "- Status: Accepted",
      "- Date: 2026-10-04",
      "- Source: issue #109 (finding R1-01), PR #180 review",
      "- Amends: [0109](0109-loan.md) §6,",
      "  [0024](0024-draw-timing.md) (a tranche)",
      "- Amended by: ADR 0137 (decisions 1 and 4)",
      "- Related: [0116](0116-x.md)",
    ]);
    expect(a.number).toBe("0120");
    expect(a.title).toBe("Tranche on a recast payment");
    expect(a.status).toBe("Accepted");
    expect(a.amends).toEqual(["0109", "0024"]);
    expect(a.amendedBy).toEqual(["0137"]);
    expect(a.supersedes).toEqual([]);
    expect(a.ids).toEqual(["#109"]);
    expect(a.errors).toEqual([]);
  });

  it("ignores non-ADR targets, dates and the self-amendment line", () => {
    const a = parse("0133", "ltv", "LTV", [
      "- Status: Accepted",
      "- Date: 2026-10-05",
      "- Amended: 2026-10-06 (after review)",
      "- Amends: SPEC §Snapshot (2026 text) and DR-092",
    ]);
    expect(a.amends).toEqual([]);
    expect(a.amendedBy).toEqual([]);
  });

  it("takes issue IDs from a self-amendment, but not PR numbers", () => {
    const a = parse("0121", "cash", "Cash", [
      "- Status: Accepted",
      "- Date: 2026-10-04",
      "- Source: issue #102",
      "- Amended: 2026-10-04 (issue #185, found by the review of",
      "  PR #183)",
    ]);
    expect(a.ids).toEqual(["#102", "#185"]);
  });

  it("collects D/J/Q source IDs and quoted follow-up decisions", () => {
    const text = [
      adr("0068", "CI", [
        "- Status: Superseded by 0151",
        "- Date: 2026-10-02",
        "- Source IDs: D-68, DR-161 (P10 follow-up F-03, D-71)",
      ]),
      "- **D-69**: a follow-up.",
      "",
    ].join("\n");
    const a = parseAdr("0068-ci.md", text);
    expect(a.status).toBe("Superseded by 0151");
    expect(a.supersededBy).toBe("0151");
    expect(a.ids).toEqual(["D-68", "DR-161", "F-03", "D-71", "D-69"]);
  });

  it("reports a bad heading, a bad status and a missing date", () => {
    const a = parseAdr(
      "0005-x.md",
      ["# 0006 Wrong", "", "- Status: Done", "", "## Context", ""].join("\n"),
    );
    expect(a.errors).toEqual([
      '0005-x.md: the heading must be "# 0005. Title"',
      '0005-x.md: Status "Done" is not Proposed, Accepted, Rejected or Superseded by NNNN',
      "0005-x.md: no Date line",
    ]);
  });
});

describe("checkAdrs", () => {
  const ok = (n, header = []) =>
    parse(n, "x", `Title ${n}`, [
      "- Status: Accepted",
      "- Date: 2026-10-07",
      ...header,
    ]);

  it("passes paired links", () => {
    expect(
      checkAdrs([
        ok("0001", ["- Amended by: ADR 0002"]),
        ok("0002", ["- Amends: ADR 0001", "- Supersedes: ADR 0003"]),
        parse("0003", "x", "Old", [
          "- Status: Superseded by 0002",
          "- Date: 2026-10-07",
        ]),
      ]),
    ).toEqual([]);
  });

  it("names each one-sided link", () => {
    expect(
      checkAdrs([
        ok("0001", ["- Amended by: ADR 0003"]),
        ok("0002", ["- Amends: ADR 0001", "- Supersedes: ADR 0003"]),
        ok("0003"),
        parse("0004", "x", "Old", [
          "- Status: Superseded by 0002",
          "- Date: 2026-10-07",
        ]),
      ]),
    ).toEqual([
      "0001 says Amended by 0003, but 0003 has no Amends 0001",
      "0002 amends 0001, but 0001 has no Amended by 0002",
      "0002 supersedes 0003, but 0003 is not Superseded by 0002",
      "0004 is Superseded by 0002, but 0002 has no Supersedes 0004",
    ]);
  });

  it("reports duplicate numbers, missing targets and parse errors", () => {
    const bad = parseAdr("0009-y.md", "# 0009 No dot\n\n## Context\n");
    expect(
      checkAdrs([
        ok("0001", ["- Amends: ADR 0042"]),
        parse("0001", "dup", "Dup", [
          "- Status: Accepted",
          "- Date: 2026-10-07",
        ]),
        bad,
      ]),
    ).toEqual([
      "0001 is used twice: 0001-x.md, 0001-dup.md",
      "0001 amends 0042, which does not exist",
      ...bad.errors,
    ]);
  });
});

describe("renderIndex and replaceIndex", () => {
  const adrs = [
    parse("0011", "private", "Private repo | real seed", [
      "- Status: Superseded by 0081",
      "- Date: 2026-09-30",
      "- Source IDs: D-11",
    ]),
    parse("0003", "czech", "Czech practice", [
      "- Status: Accepted",
      "- Amended by: ADR 0081, [0150](0150-x.md)",
      "- Date: 2026-09-30",
      "- Source IDs: D-03",
    ]),
  ];

  it("sorts by number, shows status and amendments, escapes pipes", () => {
    expect(renderIndex(adrs).split("\n")).toEqual([
      "| ADR | Title | Status | IDs |",
      "| --- | --- | --- | --- |",
      "| [0003](0003-czech.md) | Czech practice | Accepted · amended by 0081, 0150 | D-03 |",
      "| [0011](0011-private.md) | Private repo \\| real seed | Superseded by 0081 | D-11 |",
    ]);
  });

  it("replaces only the text between the markers", () => {
    const readme = [
      "# ADRs",
      "<!-- adr-index:start -->",
      "old table",
      "<!-- adr-index:end -->",
      "## Judgment calls",
    ].join("\n");
    expect(replaceIndex(readme, "NEW")).toBe(
      [
        "# ADRs",
        "<!-- adr-index:start -->",
        "",
        "NEW",
        "",
        "<!-- adr-index:end -->",
        "## Judgment calls",
      ].join("\n"),
    );
    expect(() => replaceIndex("# no markers", "NEW")).toThrow(
      "adr-index:start",
    );
  });
});

describe("the real docs/adr", () => {
  it("has paired links and a current index", async () => {
    const { errors, current, expected } = await generateReadme();
    expect(errors).toEqual([]);
    expect(current).toBe(expected);
  });
});
