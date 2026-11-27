// `pnpm check` (#461): the one gate list, its runner, the documents generated from it, and
// the documents and workflow that must agree with it.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_SLACK } from "../check-coverage-ratchet.mjs";
import {
  CI_SETUP,
  CI_STEP_IFS,
  GATES,
  LAYOUT_TAG,
  MENU_CHANGED,
  MENU_PATHS,
  ciDrift,
  ciSteps,
  command,
  generateDocs,
  renderContributing,
  renderReadme,
  replaceBlock,
  runGates,
  select,
  workflowJobs,
  workflowSteps,
  yamlTree,
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
      expect(["check", "release", "ci", "nightly", "weekly"]).toContain(
        g.where,
      );
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

  // #619: with the default worker count the heavy engine tests time out when another
  // job runs; the hook keeps to two workers, as the full suite does.
  it("caps the pre-commit hook's vitest workers at 2", () => {
    const vitest = Object.values(pkg["lint-staged"]).filter((c) =>
      String(c).startsWith("vitest "),
    );
    expect(vitest).toEqual([
      "vitest related --run --passWithNoTests --maxWorkers=2",
    ]);
  });

  it("states the coverage ratchet's slack from check-coverage-ratchet.mjs", () => {
    const gate = GATES.find((g) => g.id === "coverage-ratchet");
    expect(gate.what).toContain(`more than ${MAX_SLACK} points below`);
    expect(gate.readme).toContain(`more than ${MAX_SLACK} points below`);
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
    { id: "w", run: "pnpm w", what: "w", where: "weekly" },
  ];

  it("CONTRIBUTING lists the local gates, then the release and CI extras", () => {
    const md = renderContributing(sample);
    expect(md).toContain("| `pnpm x` | x works |");
    expect(md).toContain("| `pnpm z` | z works | net |");
    expect(md).toContain("| `grep -E 'a\\|b' f` | y works | slow |");
    expect(md.indexOf("pnpm z")).toBeLessThan(md.indexOf("grep"));
    expect(md).not.toContain("pnpm n");
    expect(md).not.toContain("pnpm w");
  });

  it("README lists every gate with where it runs", () => {
    const md = renderReadme(sample);
    expect(md).toContain("| `pnpm x` | x works | `pnpm check`, CI |");
    expect(md).toContain("| `grep -E 'a\\|b' f` | Y | CI |");
    expect(md).toContain("| `pnpm z` | z works | `pnpm check:release`, CI |");
    expect(md).toContain("| `N=1 pnpm n` | n | Nightly |");
    expect(md).toContain("| `pnpm w` | w | Weekly |");
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

  // A miss installs the browser with its libraries, a hit the libraries alone (#496).
  it.each([".github/workflows/ci.yml", ".github/workflows/e2e.yml"])(
    "%s installs the Playwright browser from a cache keyed on its version",
    (file) => {
      const steps = workflowSteps(read(file));
      const line = (l) => steps.find((s) => s.lines.includes(l));
      const [install, deps] = CI_SETUP;
      expect(line(install).if).toBe(
        "steps.playwright-cache.outputs.cache-hit != 'true'",
      );
      expect(line(deps).if).toBe(
        "steps.playwright-cache.outputs.cache-hit == 'true'",
      );
      expect(read(file)).toContain(
        "key: playwright-${{ runner.os }}-${{ steps.playwright.outputs.version }}",
      );
    },
  );

  it("selects the Czech / Russian layout screens by the harness's tag (#496)", async () => {
    const { LAYOUT_TAG: harnessTag } =
      await import("../../ux-capture/layoutScreens.ts");
    expect(LAYOUT_TAG).toBe(harnessTag);
    const i18n = GATES.find((g) => g.id === "axe-i18n");
    expect(i18n.run).toContain(`--grep ${harnessTag} `);
    expect(ciSteps(i18n)[0].run).toMatch(new RegExp(`--grep ${harnessTag}$`));
    expect(ci).toContain(`--grep ${harnessTag}\n`);
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

  it("knows no nightly or weekly gate", () => {
    const nightly = GATES.filter((g) =>
      ["nightly", "weekly"].includes(g.where),
    );
    const yaml = `jobs:\n  a:\n    steps:\n      - run: pnpm mutation\n`;
    expect(ciDrift(yaml, { gates: nightly })).toEqual([
      "a step in a runs `pnpm mutation`, which is no gate",
    ]);
  });

  it("reads a workflow's maps, lists, flow lists, block scalars and quotes", () => {
    const yaml = [
      "# a comment",
      "env:",
      '  A: "1" # quoted',
      "jobs:",
      "  x:",
      "    if: >-",
      "      !cancelled() &&",
      "      (b)",
      "    strategy:",
      "      matrix:",
      "        tz: [Pacific/Pago_Pago, 'UTC']",
      "        leg:",
      "          - one # first",
      "          - two",
      "        include:",
      "          - leg: three",
      "            tz: UTC",
      "    steps:",
      "      - uses: a@b # v1",
      "      - run: |",
      "          pnpm one",
      "",
      "          pnpm two",
    ].join("\n");
    expect(yamlTree(yaml)).toEqual({
      env: { A: "1" },
      jobs: {
        x: {
          if: "!cancelled() && (b)",
          strategy: {
            matrix: {
              tz: ["Pacific/Pago_Pago", "UTC"],
              leg: ["one", "two"],
              include: [{ leg: "three", tz: "UTC" }],
            },
          },
          steps: [{ uses: "a@b" }, { run: "pnpm one\npnpm two" }],
        },
      },
    });
  });

  describe("a step env that reads the matrix", () => {
    const gates = [
      {
        id: "tz-negative",
        run: "pnpm test",
        env: { TZ: "Pacific/Pago_Pago" },
        where: "ci",
      },
    ];
    const yaml = (zones) =>
      [
        "jobs:",
        "  tz:",
        "    strategy:",
        "      matrix:",
        `        tz: [${zones}]`,
        "    steps:",
        "      - run: pnpm test",
        "        env:",
        "          TZ: ${{ matrix.tz }}",
      ].join("\n");

    it("counts once per matrix value", () => {
      expect(
        ciDrift(yaml("Pacific/Kiritimati, Pacific/Pago_Pago"), { gates }),
      ).toEqual([]);
    });

    it("fails when no matrix value is the gate's", () => {
      expect(ciDrift(yaml("UTC"), { gates })).toEqual([
        'tz-negative: `pnpm test` runs with env {"TZ":"UTC"}, expected {"TZ":"Pacific/Pago_Pago"}',
      ]);
    });

    it("fails a matrix key the job does not have", () => {
      expect(
        ciDrift(yaml("Pacific/Pago_Pago").replace("matrix.tz", "matrix.zone"), {
          gates,
        }),
      ).toEqual([
        'tz-negative: `pnpm test` runs with env {"TZ":"${{ matrix.zone }}"}, expected {"TZ":"Pacific/Pago_Pago"}',
      ]);
    });
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
      "fewer axe shards than the run's /6",
      "shard: [1, 2, 3, 4, 5, 6]",
      "shard: [1, 2]",
    ],
  ])("fails a weakened step: %s", (_, from, to) => {
    expect(ciDrift(weaken(from, to)).length).toBeGreaterThan(0);
  });

  it("reads each job's keys, if, needs, env, defaults and matrix, and the workflow's env and defaults", () => {
    const yaml = [
      "env:",
      "  A: x",
      "defaults:",
      "  run:",
      "    working-directory: sub",
      "jobs:",
      "  a:",
      "    if: false",
      "    continue-on-error: true",
      "    env:",
      "      B: y",
      "    defaults:",
      "      run:",
      "        shell: sh",
      "    strategy:",
      "      matrix:",
      "        shard: [1, 2]",
      "    steps:",
      "      - run: pnpm one",
      "  b:",
      "    needs: a",
      "    steps:",
      "      - run: pnpm two",
    ].join("\n");
    expect(workflowJobs(yaml)).toEqual({
      env: { A: "x" },
      defaults: { run: { "working-directory": "sub" } },
      jobs: {
        a: {
          keys: [
            "if",
            "continue-on-error",
            "env",
            "defaults",
            "strategy",
            "steps",
          ],
          if: "false",
          needs: [],
          env: { B: "y" },
          defaults: { run: { shell: "sh" } },
          matrix: { shard: ["1", "2"] },
        },
        b: {
          keys: ["needs", "steps"],
          needs: ["a"],
          env: {},
          defaults: {},
          matrix: null,
        },
      },
    });
  });

  const DRAFT_IF =
    "    if: github.event_name == 'push' || !github.event.pull_request.draft\n";
  it.each([
    [
      "the rust job switched off",
      `    name: Rust (fmt · clippy · test · audit · build)\n${DRAFT_IF}`,
      "    name: Rust (fmt · clippy · test · audit · build)\n    if: false\n",
      "job rust runs only if `false`",
    ],
    [
      "the Frontend check skipped, not failed, when a job fails",
      "    needs: [frontend-checks, frontend-tz-negative, frontend-tz-positive]\n    if: >-\n      !cancelled() &&\n",
      "    needs: [frontend-checks, frontend-tz-negative, frontend-tz-positive]\n    if: >-\n      success() &&\n",
      "job frontend runs only if `success() && (",
    ],
    [
      "a job allowed to fail",
      "    name: Frontend checks and coverage\n",
      "    name: Frontend checks and coverage\n    continue-on-error: true\n",
      "job frontend-checks has continue-on-error",
    ],
    [
      "a job-level env that reaches every gate step",
      "    name: Frontend checks and coverage\n",
      '    name: Frontend checks and coverage\n    env:\n      FC_RUNS: "1"\n',
      'test: `pnpm test:coverage` runs with env {"FC_RUNS":"1"}, expected {}',
    ],
    [
      "a workflow-level env that reaches every gate step",
      "\njobs:\n",
      '\nenv:\n  FC_RUNS: "1"\n\njobs:\n',
      'knip: `pnpm knip` runs with env {"FC_RUNS":"1"}, expected {}',
    ],
    [
      "a workflow default working-directory",
      "\njobs:\n",
      "\ndefaults:\n  run:\n    working-directory: e2e\n\njobs:\n",
      "lint: the `pnpm lint` step runs in `e2e`, not the repository root",
    ],
    [
      "a job default shell",
      "    name: Frontend checks and coverage\n",
      "    name: Frontend checks and coverage\n    defaults:\n      run:\n        shell: sh\n",
      "typecheck: the `pnpm typecheck` step runs in shell `sh`",
    ],
    [
      "a gate step's shell",
      "        run: pnpm typecheck\n",
      "        run: pnpm typecheck\n        shell: sh\n",
      "typecheck: the `pnpm typecheck` step runs in shell `sh`",
    ],
    [
      "a gate step in another directory",
      "        run: pnpm lint\n",
      "        run: pnpm lint\n        working-directory: e2e\n",
      "lint: the `pnpm lint` step runs in `e2e`, not the repository root",
    ],
    [
      "cargo audit run outside src-tauri",
      "        working-directory: src-tauri\n        run: cargo audit\n",
      "        run: cargo audit\n",
      "cargo-audit: the `cargo audit` step runs in the repository root, not `src-tauri`",
    ],
    [
      "an axe shard excluded",
      "        shard: [1, 2, 3, 4, 5, 6]\n",
      "        shard: [1, 2, 3, 4, 5, 6]\n        exclude:\n          - shard: 6\n",
      "job axe-shard has a matrix exclude, which this check cannot read",
    ],
    [
      "a matrix include",
      "        shard: [1, 2, 3, 4, 5, 6]\n",
      "        shard: [1, 2, 3, 4, 5, 6]\n        include:\n          - shard: 1\n            UX_LANG: cs\n",
      "job axe-shard has a matrix include, which this check cannot read",
    ],
    [
      "an sh line",
      "        run: pnpm knip\n",
      "        run: pnpm knip\n\n      - run: sh scripts/skip.sh\n",
      "a step in frontend-checks runs `sh scripts/skip.sh`, which is no gate",
    ],
    [
      "an npm line",
      "        run: pnpm knip\n",
      "        run: pnpm knip\n\n      - run: npm test -- --passWithNoTests\n",
      "a step in frontend-checks runs `npm test -- --passWithNoTests`, which is no gate",
    ],
    [
      "a yarn line",
      "        run: pnpm knip\n",
      "        run: pnpm knip\n\n      - run: yarn knip --no-exit-code\n",
      "a step in frontend-checks runs `yarn knip --no-exit-code`, which is no gate",
    ],
    [
      "the frontend aggregate loses !cancelled()",
      `    needs: [frontend-checks, frontend-tz-negative, frontend-tz-positive]\n    if: >-\n      !cancelled() &&\n      (github.event_name == 'push' || !github.event.pull_request.draft)\n`,
      `    needs: [frontend-checks, frontend-tz-negative, frontend-tz-positive]\n${DRAFT_IF}`,
      "job frontend runs only if `github.event_name == 'push' || !github.event.pull_request.draft`, not `!cancelled() && (",
    ],
    [
      "the axe aggregate loses !cancelled()",
      "    needs: axe-shard\n    if: >-\n      !cancelled() &&\n",
      "    needs: axe-shard\n    if: >-\n",
      "job axe runs only if `(github.event_name",
    ],
    [
      "the frontend aggregate loses its if",
      `    needs: [frontend-checks, frontend-tz-negative, frontend-tz-positive]\n    if: >-\n      !cancelled() &&\n      (github.event_name == 'push' || !github.event.pull_request.draft)\n`,
      "    needs: [frontend-checks, frontend-tz-negative, frontend-tz-positive]\n",
      "job frontend runs only if `success()`, not `!cancelled() && (",
    ],
    [
      "the frontend aggregate stops checking one job's result",
      '          [[ "${{ needs.frontend-tz-positive.result }}" == success ]]\n',
      "",
      'job frontend does not check `[[ "${{ needs.frontend-tz-positive.result }}" == success ]]`',
    ],
    [
      "the axe aggregate accepts a failed shard",
      `'[[ "\${{ needs.axe-shard.result }}" == success ]]'`,
      `'[[ "\${{ needs.axe-shard.result }}" != cancelled ]]'`,
      'job axe does not check `[[ "${{ needs.axe-shard.result }}" == success ]]`',
    ],
    [
      "the aggregate's result step allowed to fail",
      "      - name: Every axe shard passed\n",
      "      - name: Every axe shard passed\n        continue-on-error: true\n",
      'job axe does not check `[[ "${{ needs.axe-shard.result }}" == success ]]`',
    ],
    [
      "the menu test switched off by its step if",
      `        if: ${MENU_CHANGED}\n        run: |\n          set -o pipefail`,
      "        if: false\n        run: |\n          set -o pipefail",
      'menu-macos: the `cargo test --manifest-path src-tauri/Cargo.toml --test menu_built | tee "$log"` step runs only if `false`',
    ],
    [
      "the menu job skipped at job level, which a required check must never be",
      `    name: Rust menu on macOS (AppKit pin)\n${DRAFT_IF}`,
      `    name: Rust menu on macOS (AppKit pin)\n    if: \${{ ${MENU_CHANGED} }}\n`,
      "job rust-macos runs only if",
    ],
  ])("fails a weakened job or workflow: %s", (_, from, to, problem) => {
    const problems = ciDrift(weaken(from, to));
    expect(
      problems.some((p) => p.includes(problem)),
      problems.join("\n"),
    ).toBe(true);
  });
});

// The owner, 2026-11-27: the macOS menu job does its work only when the built menu can
// change, and is a required check, so the job always runs and reports; its steps wait on
// a path check, and a push to main always runs the test.
describe("the macOS menu job runs its test only when the menu can change", () => {
  const ci = read(".github/workflows/ci.yml");
  const steps = workflowSteps(ci).filter((s) => s.job === "rust-macos");
  const check = steps.find((s) => s.lines[0] === "paths=(");

  it("pins the paths that can change the built menu", () => {
    expect(MENU_PATHS).toEqual([
      ".github/workflows/ci.yml",
      "rust-toolchain.toml",
      "src-tauri/Cargo.lock",
      "src-tauri/Cargo.toml",
      "src-tauri/src/menu.rs",
      "src-tauri/tests/menu_built.rs",
      "src-tauri/tests/menu_built.txt",
    ]);
  });

  it("lets only the menu test wait on the path check", () => {
    expect(MENU_CHANGED).toBe("steps.menu-paths.outputs.changed == 'true'");
    expect(CI_STEP_IFS["menu-macos"]).toEqual([MENU_CHANGED]);
    for (const [id, ifs] of Object.entries(CI_STEP_IFS))
      if (id !== "menu-macos") expect(ifs, id).not.toContain(MENU_CHANGED);
  });

  it("checks exactly those paths, first, and gates every later step on it", () => {
    expect(check, "the path check step").toBeDefined();
    expect(check.keys).toEqual(["name", "id", "env", "run"]);
    expect(check.if).toBeUndefined();
    expect(check.env).toEqual({ EVENT: "${{ github.event_name }}" });
    expect(check.lines.slice(1, MENU_PATHS.length + 2)).toEqual([
      ...MENU_PATHS,
      ")",
    ]);
    const [checkout, ...rest] = steps;
    expect(checkout.keys).toEqual(["uses", "with"]);
    expect(rest[0]).toBe(check);
    expect(rest.length).toBeGreaterThan(1);
    for (const s of rest.slice(1)) expect(s.if, s.lines[0]).toBe(MENU_CHANGED);
    // HEAD^1 of the pull request's merge commit is the base branch.
    const job = ci.split("\n  rust-macos:\n")[1].split("\n  # ──")[0];
    expect(job).toContain("        with:\n          fetch-depth: 2\n");
  });

  // menu-paths.test.mjs runs the check itself.
});
