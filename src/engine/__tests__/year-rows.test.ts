// #478: pins what the hand-written field lists of a projection year do today, so the
// refactor that derives them from one table moves nothing. Every key list here is
// derived from the objects themselves, not copied from the engine.
import { describe, it, expect } from "vitest";
import { D, Decimal, ONE } from "../../lib/money";
import { edate, isOnOrBefore } from "../dates";
import { portfolioSnapshot, propertySnapshot } from "../metrics";
import {
  cpiIndex,
  portfolioProjection,
  propertyProjections,
} from "../projections";
import {
  EMPTY_PROPERTY_SCHEDULE,
  propertySchedules,
  scheduleRows,
} from "../schedule";
import { applyScenario } from "../scenarios";
import {
  portfolioSnapshotAtYear,
  propertySnapshotAtYear,
  realPortfolioSnapshot,
  realProjection,
  realPropertySnapshot,
} from "../real";
import { rate } from "../brands";
import type {
  Portfolio,
  PortfolioSnapshot,
  ProjectionYear,
  PropertySnapshot,
} from "../types";
import { assumptions, portfolio, BASE_DATE } from "./support/seed";
import { mixed } from "./support/mixed";
import { mixedCashOutside } from "./support/synthetic";
import { KC, RATIO, near } from "./support/tolerance";

const shocked = applyScenario(assumptions, {
  inflationShock: { deltaPa: rate("0.03"), durationYears: 3 },
});

const FIXTURES: [string, Portfolio][] = [
  ["the seed", portfolio],
  ["mixed", mixed],
  ["mixedCashOutside", mixedCashOutside],
];

const LABELS = new Set(["year", "calendarYear", "periodStart", "periodEnd"]);
const RATIOS = new Set(["ltv", "dscr", "ratePa"]);
const STOCKS = new Set([
  "value",
  "balance",
  "committedDebt",
  "undrawnDebt",
  "reportedValue",
  "equity",
]);
const keysOf = <T extends object>(o: T) => Object.keys(o) as (keyof T)[];
const moneyOf = (y: ProjectionYear) =>
  keysOf(y).filter((k) => !LABELS.has(k) && !RATIOS.has(k));
const flowsOf = (y: ProjectionYear) => moneyOf(y).filter((k) => !STOCKS.has(k));
const dec = (v: unknown) => v as Decimal;

describe("realProjection deflates every non-zero money field (#478)", () => {
  it.each(FIXTURES)("%s: real ≠ nominal and real = nominal ÷ cpi", (_, pf) => {
    const cpi = cpiIndex(shocked);
    const n = portfolioProjection(pf, shocked);
    const r = realProjection(n, cpi);
    let checked = 0;
    for (let t = 1; t <= shocked.horizonYears; t++) {
      expect(cpi[t]!.equals(ONE), `cpi @ ${t}`).toBe(false);
      for (const k of moneyOf(n[t]!)) {
        const nom = dec(n[t]![k]);
        const real = dec(r[t]![k]);
        expect(real.equals(nom.div(cpi[t]!)), `${k} @ ${t}`).toBe(true);
        if (nom.isZero()) continue;
        expect(real.equals(nom), `${k} @ ${t} stays nominal`).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

/** Snapshot key → the projection-year key it is read from, written here apart from
 *  the engine. */
const PORTFOLIO_FROM_YEAR: Partial<
  Record<keyof PortfolioSnapshot, keyof ProjectionYear>
> = {
  totalValue: "value",
  totalDebt: "balance",
  totalCommittedDebt: "committedDebt",
  totalUndrawnDebt: "undrawnDebt",
  totalReportedValue: "reportedValue",
  totalEquity: "equity",
  ltv: "ltv",
  grossAnnualRent: "grossRent",
  effectiveGrossIncome: "effectiveRent",
  holdingCosts: "holdingCosts",
  noi: "noi",
  annualDebtService: "debtService",
  netCashFlow: "netCashFlow",
  dscr: "dscr",
};
const PROPERTY_FROM_YEAR: Partial<
  Record<keyof PropertySnapshot, keyof ProjectionYear>
> = {
  value: "value",
  debt: "balance",
  committedDebt: "committedDebt",
  undrawnDebt: "undrawnDebt",
  reportedValue: "reportedValue",
  equity: "equity",
  ltv: "ltv",
  grossAnnualRent: "grossRent",
  effectiveGrossIncome: "effectiveRent",
  holdingCosts: "holdingCosts",
  noi: "noi",
  annualDebtService: "debtService",
  netCashFlow: "netCashFlow",
  dscr: "dscr",
};
const YIELDS = new Set(["grossYield", "netYield"]);
/** Lens-invariant Decimal keys of a snapshot. */
const SNAPSHOT_RATIOS = new Set([...YIELDS, "ltv", "dscr", "weightedAvgRate"]);

/** Every key of `out` is read off `r` (by identity), is a yield of `r`, or is `s`'s
 *  own value (by identity); and every Decimal key of `s` but the weighted rate is read
 *  off `r`. */
function expectAtYear<S extends object>(
  s: S,
  r: ProjectionYear,
  out: S,
  fromYear: Partial<Record<keyof S, keyof ProjectionYear>>,
) {
  expect(keysOf(out)).toEqual(keysOf(s));
  for (const k of keysOf(s)) {
    const src = fromYear[k];
    const label = String(k);
    if (src !== undefined) expect(out[k], label).toBe(r[src]);
    else if (YIELDS.has(label)) {
      const income = label === "grossYield" ? r.grossRent : r.noi;
      expect(dec(out[k]).equals(income.div(r.value)), label).toBe(true);
    } else {
      expect(out[k], label).toBe(s[k]);
      const kept = !(s[k] instanceof Decimal) || label === "weightedAvgRate";
      expect(kept, `${label} is a figure but not read off the year`).toBe(true);
    }
  }
}

/** Money keys divided by `k`, the lens-invariant ones and the rest kept by identity. */
function expectReal<S extends object>(s: S, k: Decimal, out: S) {
  expect(keysOf(out)).toEqual(keysOf(s));
  const money = keysOf(s).filter(
    (key) => s[key] instanceof Decimal && !SNAPSHOT_RATIOS.has(String(key)),
  );
  expect(money.length).toBeGreaterThan(0);
  for (const key of keysOf(s)) {
    const label = String(key);
    if (money.includes(key))
      expect(dec(out[key]).equals(dec(s[key]).div(k)), label).toBe(true);
    else expect(out[key], label).toBe(s[key]);
  }
}

describe("snapshots read off a projection year and in real terms (#478)", () => {
  const full = propertySchedules(
    mixed.mortgages,
    mixed.properties.map((p) => p.id),
    assumptions,
  );
  const asOf = edate(BASE_DATE, 60);
  const snap = portfolioSnapshot(mixed, assumptions, asOf, scheduleRows(full));
  const rows = portfolioProjection(mixed, assumptions);
  const byProperty = propertyProjections(mixed, assumptions, full);

  it("portfolioSnapshotAtYear reads every mapped key by identity", () => {
    const r = rows[5]!;
    const out = portfolioSnapshotAtYear(snap, r);
    expectAtYear(snap, r, out, PORTFOLIO_FROM_YEAR);
    expect(out.perProperty).toBe(snap.perProperty);
  });

  it("propertySnapshotAtYear reads every mapped key by identity", () => {
    for (const p of mixed.properties) {
      const ps = propertySnapshot(
        p,
        mixed,
        assumptions,
        asOf,
        (full.get(p.id) ?? EMPTY_PROPERTY_SCHEDULE).rows,
      );
      const r = byProperty.get(p.id)![5]!;
      expectAtYear(ps, r, propertySnapshotAtYear(ps, r), PROPERTY_FROM_YEAR);
    }
  });

  it("the real snapshots divide every money key and keep the rest", () => {
    const k = D("1.1");
    expectReal(snap, k, realPortfolioSnapshot(snap, k));
    for (const ps of snap.perProperty)
      expectReal(ps, k, realPropertySnapshot(ps, k));
    expect(realPortfolioSnapshot(snap, ONE)).toBe(snap);
    expect(realPropertySnapshot(snap.perProperty[0]!, ONE)).toBe(
      snap.perProperty[0],
    );
  });
});

describe("empty rows: before a future buy and the flows of year 0 (#478)", () => {
  const byProperty = propertyProjections(mixed, assumptions);

  it("years before a future buy are all zero, ltv zero, dscr and rate null", () => {
    const rows = byProperty.get("future")!;
    const tStart = rows.findIndex((y) => !y.value.isZero());
    expect(tStart).toBeGreaterThan(1);
    for (const y of rows.slice(0, tStart)) {
      for (const k of moneyOf(y))
        expect(dec(y[k]).isZero(), `${k} @ ${y.year}`).toBe(true);
      expect(dec(y.ltv).isZero()).toBe(true);
      expect(y.dscr).toBeNull();
      expect(y.ratePa).toBeNull();
    }
  });

  it("year 0 has zero flows, dscr and rate null (property and portfolio rows)", () => {
    const zeros = [
      ...[...byProperty.values()].map((rows) => rows[0]!),
      portfolioProjection(mixed, assumptions)[0]!,
    ];
    for (const y of zeros) {
      for (const k of flowsOf(y)) expect(dec(y[k]).isZero(), k).toBe(true);
      expect(y.dscr).toBeNull();
      expect(y.ratePa).toBeNull();
    }
  });
});

describe("snapshot equity and LTV at baseDate + N years equal projection year N (#478)", () => {
  it.each(FIXTURES)("%s", (_, pf) => {
    const full = propertySchedules(
      pf.mortgages,
      pf.properties.map((p) => p.id),
      assumptions,
    );
    const byProperty = propertyProjections(pf, assumptions, full);
    const owned = pf.properties.filter(
      (p) => p.active !== false && isOnOrBefore(p.purchaseDate, BASE_DATE),
    );
    expect(owned.length).toBeGreaterThan(0);
    for (const p of owned) {
      const rows = (full.get(p.id) ?? EMPTY_PROPERTY_SCHEDULE).rows;
      const proj = byProperty.get(p.id)!;
      for (let n = 0; n <= assumptions.horizonYears; n++) {
        const asOf = edate(BASE_DATE, n * 12);
        const s = propertySnapshot(p, pf, assumptions, asOf, rows);
        const y = proj[n]!;
        near(s.equity, y.equity.toNumber(), KC, `${p.id} N=${n} equity`);
        expect(s.ltv === null, `${p.id} N=${n} ltv null`).toBe(y.ltv === null);
        if (s.ltv && y.ltv)
          near(s.ltv, y.ltv.toNumber(), RATIO, `${p.id} N=${n} ltv`);
      }
    }
  });
});
