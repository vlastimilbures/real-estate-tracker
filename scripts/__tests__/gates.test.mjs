// `pnpm check` (#461): the one gate list, its runner, the documents generated from it, and
// the documents and workflow that must agree with it.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GATES,
  ciDrift,
  ciSteps,
  command,
  generateDocs,
  renderContributing,
  renderReadme,
  replaceBlock,
  runGates,
  select,
  workflowSteps,
} from "../gates.mjs";

const read = (file) =>
  readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));

/** Every command a gate stands for: its own, what it covers, what ci.yml runs for it. */
const known = (g) => [
  command(g),
  g.run,
  ...(g.covers ?? []),
  ...ciSteps(g).map((s) => s.run),
];

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
  const ci = read(".github/workflows/ci.yml");
  /** ci.yml with `from` replaced by `to`, once; `from` must be there. */
  const weaken = (from, to) => {
    expect(ci, from).toContain(from);
    return ci.replace(from, to);
  };

  it("reads each step's shell lines and env, block scalars and comments included", () => {
    const yaml = [
      "jobs:",
      "  a:",
      "    steps:",
      "      # between steps",
      "      - name: One",
      "        run: pnpm one",
      "        env:",
      "          # a comment",
      '          TZ: "UTC"',
      "      - run: |",
      "          pnpm two",
      "          pnpm three",
      "  b:",
      "    runs-on: x",
    ].join("\n");
    expect(workflowSteps(yaml)).toEqual([
      {
        job: "a",
        shards: null,
        keys: ["name", "run", "env"],
        lines: ["pnpm one"],
        env: { TZ: "UTC" },
      },
      {
        job: "a",
        shards: null,
        keys: ["run"],
        lines: ["pnpm two", "pnpm three"],
        env: {},
      },
    ]);
  });

  it("runs every gate that is not nightly, exactly, with its env", () => {
    expect(ciDrift(ci)).toEqual([]);
  });

  it("names the setup line a full job runs, and passes the known if and shards", () => {
    const yaml = [
      "jobs:",
      "  x:",
      "    strategy:",
      "      matrix:",
      "        shard: [1, 2]",
      "    steps:",
      "      - if: github.event_name == 'pull_request'",
      "        run: pnpm lint:size:baseline-check",
      "      - run: pnpm ux:capture --shard ${{ matrix.shard }}/2",
      "      - run: node scripts/other.mjs",
    ].join("\n");
    const gates = [
      {
        id: "size-baseline",
        run: "pnpm lint:size:baseline-check",
        where: "check",
      },
      {
        id: "axe",
        run: "x",
        where: "ci",
        ci: [{ run: "pnpm ux:capture --shard ${{ matrix.shard }}/2" }],
      },
    ];
    expect(ciDrift(yaml, { gates })).toEqual([
      "a step in x runs `node scripts/other.mjs`, which is no gate",
    ]);
  });

  it("knows no nightly gate", () => {
    const nightly = GATES.filter((g) => g.where === "nightly");
    const yaml = `jobs:\n  a:\n    steps:\n      - run: pnpm mutation\n`;
    expect(ciDrift(yaml, { gates: nightly })).toEqual([
      "a step in a runs `pnpm mutation`, which is no gate",
    ]);
  });

  it.each([
    [
      "knip without its exit code",
      "run: pnpm knip\n",
      "run: pnpm knip --no-exit-code\n",
    ],
    [
      "coverage thresholds off",
      "run: pnpm test:coverage\n",
      "run: pnpm test:coverage --coverage.thresholds.lines=0\n",
    ],
    [
      "clippy lints allowed",
      "--all-targets -- -D warnings\n",
      "--all-targets -- -D warnings -A clippy::all\n",
    ],
    ["the negative time zone dropped", "          TZ: Pacific/Pago_Pago\n", ""],
    [
      "the positive time zone run narrowed to the engine",
      "run: pnpm vitest run src/lib src/ui src/state\n",
      "run: pnpm vitest run src/engine\n",
    ],
    [
      "the axe run id changed",
      "          UX_RUN_ID: ci\n",
      "          UX_RUN_ID: other\n",
    ],
    [
      "Format check deleted from the full checks",
      "        run: pnpm lint\n\n      - name: Format check\n        run: pnpm exec prettier --check .\n",
      "        run: pnpm lint\n",
    ],
    [
      "ADR index deleted from the full checks",
      "      - name: ADR index and links\n        run: pnpm adr:check\n\n      - name: Audit",
      "      - name: Audit",
    ],
    [
      "a gate step allowed to fail",
      "        run: pnpm typecheck\n",
      "        run: pnpm typecheck\n        continue-on-error: true\n",
    ],
    [
      "a gate step behind an unknown if",
      "        run: pnpm depcruise\n",
      "        if: github.event_name == 'push'\n        run: pnpm depcruise\n",
    ],
    [
      "the pull-request-only if on a gate that is no baseline check",
      "        run: pnpm test:coverage\n",
      "        if: github.event_name == 'pull_request'\n        run: pnpm test:coverage\n",
    ],
    [
      "fewer axe shards than the run's /4",
      "shard: [1, 2, 3, 4]",
      "shard: [1, 2]",
    ],
  ])("fails a weakened step: %s", (_, from, to) => {
    expect(ciDrift(weaken(from, to)).length).toBeGreaterThan(0);
  });
});
