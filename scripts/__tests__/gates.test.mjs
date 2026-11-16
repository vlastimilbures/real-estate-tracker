// `pnpm check` (#461): the one gate list, its runner, the documents generated from it, and
// the documents and workflow that must agree with it.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GATES,
  command,
  generateDocs,
  renderContributing,
  renderReadme,
  replaceBlock,
  runGates,
  select,
} from "../gates.mjs";

const read = (file) =>
  readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));

/** Every command a gate stands for: its own, what it covers, what ci.yml runs for it. */
const known = (g) => [command(g), g.run, ...(g.covers ?? []), ...(g.ci ?? [])];
/** `line` is `cmd`, or `cmd` followed by arguments. */
const runs = (line, cmd) => line === cmd || line.startsWith(`${cmd} `);

/** The shell lines of every `run:` step in a workflow, block scalars included. */
function runLines(yaml) {
  const lines = yaml.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(?:- )?run:\s*(.*)$/);
    if (!m) continue;
    const value = m[2].trim();
    if (value !== "|" && value !== ">" && value !== ">-") {
      out.push(value.replace(/^'(.*)'$/, "$1"));
      continue;
    }
    const indent = m[1].length;
    for (i++; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() !== "" && line.search(/\S/) <= indent) break;
      if (line.trim() !== "") out.push(line.trim());
    }
    i--;
  }
  return out;
}

describe("the gate list", () => {
  it("has unique ids and unique commands", () => {
    const ids = GATES.map((g) => g.id);
    const commands = GATES.map(command);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(commands).size).toBe(commands.length);
  });

  // `pnpm exec`, `pnpm audit` and `pnpm vitest` run a built-in or a binary, not a script.
  it("names only pnpm scripts that exist", () => {
    const scripts = GATES.flatMap(known)
      .flatMap((c) => c.split("&&"))
      .map((c) => c.trim().match(/^pnpm (?!exec |audit |vitest )(\S+)/)?.[1])
      .filter(Boolean);
    expect(scripts.length).toBeGreaterThan(10);
    for (const s of scripts) expect(pkg.scripts, s).toHaveProperty([s]);
  });

  it("puts every gate in one place and says why a CI gate is not local", () => {
    for (const g of GATES) {
      expect(["check", "release", "ci", "nightly"]).toContain(g.where);
      expect(g.what.length).toBeGreaterThan(0);
      if (g.where === "ci" || g.where === "release") expect(g.why).toBeTruthy();
    }
  });

  it("runs the check gates in order, the release adding the two audits", () => {
    expect(select().map((g) => g.id)).toEqual([
      "format",
      "typecheck",
      "lint",
      "depcruise",
      "depcruise-baseline",
      "size-baseline",
      "knip",
      "knip-prod",
      "adr",
      "test",
      "coverage-ratchet",
      "cargo-fmt",
      "clippy",
      "cargo-test",
    ]);
    expect(select({ release: true }).map((g) => g.id)).toEqual([
      ...select().map((g) => g.id),
      "audit",
      "cargo-audit",
    ]);
  });

  it("wires pnpm check and check:release to the list", () => {
    expect(pkg.scripts.check).toBe("node scripts/gates.mjs");
    expect(pkg.scripts["check:release"]).toBe(
      "node scripts/gates.mjs --release",
    );
    expect(pkg.scripts["gates:docs"]).toBe(
      "node scripts/gates.mjs --write-docs",
    );
  });
});

describe("runGates", () => {
  const gates = [
    { id: "a", run: "A" },
    { id: "b", run: "B", env: { TZ: "UTC" } },
    { id: "c", run: "C" },
  ];

  it("runs every gate in order and reports success", () => {
    const ran = [];
    const log = [];
    const r = runGates(gates, {
      exec: (g) => (ran.push(g.id), 0),
      log: (s) => log.push(s),
    });
    expect(r).toEqual({ ok: true });
    expect(ran).toEqual(["a", "b", "c"]);
    expect(log[1]).toContain("[2/3] b: TZ=UTC B");
    expect(log.at(-1)).toContain("all 3 gates passed");
  });

  it("stops at the first failure and names it", () => {
    const ran = [];
    const log = [];
    const r = runGates(gates, {
      exec: (g) => (ran.push(g.id), g.id === "b" ? 2 : 0),
      log: (s) => log.push(s),
    });
    expect(r).toEqual({ ok: false, failed: "b" });
    expect(ran).toEqual(["a", "b"]);
    expect(log.at(-1)).toContain('gate "b" failed (exit 2): TZ=UTC B');
  });
});

describe("the generated documents", () => {
  const sample = [
    { id: "x", run: "pnpm x", what: "x works", where: "check" },
    {
      id: "y",
      run: "grep -E 'a|b' f",
      what: "y works",
      where: "ci",
      why: "slow",
      readme: "Y",
    },
    { id: "z", run: "pnpm z", what: "z works", where: "release", why: "net" },
    { id: "n", run: "pnpm n", env: { N: "1" }, what: "n", where: "nightly" },
  ];

  it("CONTRIBUTING lists the local gates, then the release and CI extras", () => {
    const md = renderContributing(sample);
    expect(md).toContain("| `pnpm x` | x works |");
    expect(md).toContain("| `pnpm z` | z works | net |");
    expect(md).toContain("| `grep -E 'a\\|b' f` | y works | slow |");
    expect(md.indexOf("pnpm z")).toBeLessThan(md.indexOf("grep"));
    expect(md).not.toContain("pnpm n");
  });

  it("README lists every gate with where it runs", () => {
    const md = renderReadme(sample);
    expect(md).toContain("| `pnpm x` | x works | `pnpm check`, CI |");
    expect(md).toContain("| `grep -E 'a\\|b' f` | Y | CI |");
    expect(md).toContain("| `pnpm z` | z works | `pnpm check:release`, CI |");
    expect(md).toContain("| `N=1 pnpm n` | n | Nightly |");
  });

  it("replaces the text between the markers only", () => {
    const doc = "a\n<!-- gates:start -->\nold\n<!-- gates:end -->\nb\n";
    expect(replaceBlock(doc, "new")).toBe(
      "a\n<!-- gates:start -->\n\nnew\n\n<!-- gates:end -->\nb\n",
    );
  });

  it("fails when a marker is missing", () => {
    expect(() => replaceBlock("a\n<!-- gates:start -->\n", "x")).toThrow(
      /gates:end/,
    );
    expect(() => replaceBlock("<!-- gates:end -->", "x")).toThrow(
      /gates:start/,
    );
  });

  it("CONTRIBUTING.md and README.md hold the current tables (pnpm gates:docs)", async () => {
    for (const d of await generateDocs())
      expect(d.current, d.file).toBe(d.expected);
  });
});

describe("the documents that point at the list", () => {
  it("CLAUDE.md §6 names only commands the list runs", () => {
    const section = read("CLAUDE.md").split("## 6.")[1].split("\n## ")[0];
    const done = section
      .split("\n- ")
      .find((b) => b.startsWith("A change is done"));
    const named = [...done.matchAll(/`(pnpm [^`]+)`/g)].map((m) => m[1]);
    expect(named).toEqual(
      expect.arrayContaining(["pnpm test", "pnpm typecheck", "pnpm knip"]),
    );
    const local = select().flatMap(known);
    for (const c of named.filter((c) => c !== "pnpm check"))
      expect(local, c).toContain(c);
    expect(done).toContain("Prettier");
    expect(local).toContain("pnpm exec prettier --check .");
  });

  it("the PR template names pnpm check and no other gate", () => {
    const template = read(".github/pull_request_template.md");
    expect(template).toContain("`pnpm check` passes");
    for (const g of GATES) expect(template).not.toContain(g.run);
    expect(template).not.toMatch(/`pnpm (test|lint|typecheck|knip|depcruise)`/);
  });

  it("the release script's checks are exactly pnpm check:release", () => {
    const script = read("scripts/release-macos.sh");
    const block = script.match(/step "Checks"\n([\s\S]*?)\nfi\n/)?.[1];
    expect(block?.trim()).toBe("pnpm check:release");
  });

  it("docs/release.md names pnpm check:release", () => {
    expect(read("docs/release.md")).toContain("`pnpm check:release`");
  });
});

describe("ci.yml agrees with the list (read only; #459 owns the workflow)", () => {
  const lines = runLines(read(".github/workflows/ci.yml"));
  // Setup and the docs fast path's subset of the suite (removed by #459): not gates.
  const SETUP = [
    "pnpm install --frozen-lockfile",
    "pnpm exec playwright install --with-deps chromium",
    "pnpm vitest run src/import/__tests__/csvGuide.test.ts scripts/__tests__/adr-index.test.mjs",
  ];

  it("reads run lines, block scalars included", () => {
    expect(
      runLines(
        "    run: a\n      - run: |\n          b\n          c\n  x: y\n",
      ),
    ).toEqual(["a", "b", "c"]);
    expect(lines).toContain("pnpm typecheck");
    expect(lines).toContain("pnpm lint:size:baseline-check");
  });

  it("runs every gate that is not nightly", () => {
    for (const g of GATES.filter((g) => g.where !== "nightly"))
      for (const c of g.ci ?? [g.run])
        expect(
          lines.some((l) => runs(l, c)),
          `${g.id}: ${c}`,
        ).toBe(true);
  });

  it("runs no pnpm or cargo command the list does not know", () => {
    const commands = GATES.flatMap(known);
    for (const l of lines.filter((l) => /^(pnpm|cargo) /.test(l)))
      expect(SETUP.includes(l) || commands.some((c) => runs(l, c)), l).toBe(
        true,
      );
  });
});
