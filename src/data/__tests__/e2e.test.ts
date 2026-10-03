// Phase 2 gate (BUILD-PLAN): load the seed FROM SQLite, map to engine inputs, run
// the engine, and reproduce every parity number end-to-end. This proves the
// migration → mappers → repositories → engine round-trip is lossless. Targets and the
// seed come from the engine's single fixture module (DR-062).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { migrate } from "../migrations";
import { seedIfEmpty } from "../seed";
import { loadPortfolio, loadAssumptions } from "../repositories";
import { portfolioSnapshot, portfolioKpis } from "../../engine";
import type {
  Portfolio,
  Assumptions,
  PortfolioSnapshot,
  PortfolioKPIs,
} from "../../engine";
import type { Decimal } from "../../lib/money";
import {
  portfolio as FIXTURE,
  assumptions as FIXTURE_ASSUMPTIONS,
  PARITY,
  RATIO_KEYS,
} from "../../engine/__tests__/support/seed";
import { KC, RATIO, near } from "../../engine/__tests__/support/tolerance";

const tol = (key: string) => (RATIO_KEYS.has(key) ? RATIO : KC);

let sql: TestSql;
let snap: PortfolioSnapshot;
let kpis: PortfolioKPIs;
let loaded: Portfolio;
let loadedAssumptions: Assumptions;

beforeAll(async () => {
  sql = openMemorySql();
  await migrate(sql);
  const seeded = await seedIfEmpty(sql);
  expect(seeded, "first run should seed").toBe(true);
  // Second call must be a no-op (idempotent first-run guard).
  expect(await seedIfEmpty(sql), "second run should NOT re-seed").toBe(false);

  loaded = await loadPortfolio(sql);
  loadedAssumptions = await loadAssumptions(sql);
  snap = portfolioSnapshot(loaded, loadedAssumptions);
  kpis = portfolioKpis(loaded, loadedAssumptions);
});

afterAll(() => sql.db.close());

const byId = (id: string) => snap.perProperty.find((p) => p.propertyId === id)!;

describe("Phase 2 e2e — portfolio snapshot from SQLite", () => {
  for (const [key, target] of Object.entries(PARITY.snapshot)) {
    it(key, () =>
      near(
        snap[key as keyof typeof PARITY.snapshot] as Decimal,
        target,
        tol(key),
        key,
      ),
    );
  }
});

describe("Phase 2 e2e — per property from SQLite", () => {
  for (const [id, row] of Object.entries(PARITY.perProperty)) {
    for (const [key, target] of Object.entries(row)) {
      it(`${id} ${key}`, () =>
        near(
          byId(id)[key as keyof typeof row] as Decimal,
          target,
          tol(key),
          `${id} ${key}`,
        ));
    }
  }
});

describe("Phase 2 e2e — 30-year KPIs from SQLite", () => {
  for (const [key, target] of Object.entries(PARITY.kpis)) {
    it(key, () => {
      const actual = kpis[key as keyof typeof PARITY.kpis];
      if (typeof actual === "number" || actual === null)
        expect(actual).toBe(target);
      else near(actual as Decimal, target, tol(key), key);
    });
  }
  it("Σ principal == initial debt", () =>
    near(kpis.totalPrincipalRepaid, snap.totalDebt.toNumber(), KC, "Σ==debt"));
});

describe("Effective-dating survives the DB round trip", () => {
  it("Lipova rent in force at baseDate is 21,675", () =>
    near(byId("lipova").grossAnnualRent, 21_675 * 12, KC, "lipova gross"));
});

// Drift tripwire (DR-062): src/data/seed.ts keeps its own copy of the seed (the data layer
// must not import engine test fixtures). After the DB round trip it must still equal the
// engine fixture. Compared on the fixture's own keys, as strings (Decimal/Date ⇒ text).
function onFixtureKeys(actual: object, expected: object): unknown {
  const pick = (a: Record<string, unknown>, e: Record<string, unknown>) =>
    Object.fromEntries(Object.keys(e).map((k) => [k, String(a[k])]));
  return pick(
    actual as Record<string, unknown>,
    expected as Record<string, unknown>,
  );
}
const sortById = <T extends { id: string }>(xs: T[]) =>
  [...xs].sort((a, b) => a.id.localeCompare(b.id));

describe("Seed drift tripwire — data/seed.ts == engine fixture", () => {
  const collections = [
    "properties",
    "mortgages",
    "valuations",
    "leases",
    "holdingCosts",
  ] as const;
  for (const c of collections) {
    it(c, () => {
      const got = sortById(loaded[c] as { id: string }[]);
      const want = sortById(FIXTURE[c] as { id: string }[]);
      expect(got.map((g) => g.id)).toEqual(want.map((w) => w.id));
      got.forEach((g, i) =>
        expect(onFixtureKeys(g, want[i]), `${c} ${g.id}`).toEqual(
          onFixtureKeys(want[i], want[i]),
        ),
      );
    });
  }
  it("assumptions", () => {
    const { defaults, ...rest } = FIXTURE_ASSUMPTIONS;
    const { defaults: gotDefaults, ...gotRest } = loadedAssumptions;
    expect(onFixtureKeys(gotRest, rest)).toEqual(onFixtureKeys(rest, rest));
    expect(onFixtureKeys(gotDefaults, defaults)).toEqual(
      onFixtureKeys(defaults, defaults),
    );
  });
});
