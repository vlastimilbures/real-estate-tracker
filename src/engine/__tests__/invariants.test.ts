// P3 invariant suite (DR-034), scoped as SPEC defines each invariant. Runs over the seed
// and a "mixed" portfolio that adds a future-dated purchase with a new loan, a
// development loan with draws, and a deactivated property. A failing invariant is an
// engine bug: it is never weakened here (standing rule 8).
import { describe, it, expect } from "vitest";
import { portfolioSnapshot, propertySnapshot } from "../metrics";
import { portfolioProjection, propertyProjection } from "../projections";
import { portfolioKpis } from "../kpis";
import { isDevLoan } from "../amortization";
import { propertySchedule, schedulesByProperty } from "../schedule";
import { drawnFraction } from "../growth";
import { applyScenario } from "../scenarios";
import { edate, isAfter, isOnOrBefore, isoDate } from "../dates";
import { ZERO, type Decimal } from "../../lib/money";
import type {
  Assumptions,
  AmortizationRow,
  MortgageBlock,
  Portfolio,
} from "../types";
import { assumptions, portfolio, PARITY } from "./support/seed";
import { devBlock, mixed } from "./support/mixed";
import { KC, near } from "./support/tolerance";
import { rate } from "../brands";
import type { IsoDate } from "../brands";
import { money } from "../brands";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** The seed with two successors after baseDate: Javorova refixed on its fixation
 *  end, Lipova refinanced with cash out (D-27, D-47). */
const refinanced: Portfolio = {
  ...portfolio,
  mortgages: [
    ...portfolio.mortgages,
    {
      id: "m-refi-javorova",
      propertyId: "javorova",
      startDate: isoDate("2031-01-17"),
      initialPrincipal: money("1633000"),
      fixationYears: 5,
      interestRatePa: rate("0.039"),
      monthlyInstalment: money("9800"),
    },
    {
      id: "m-refi-lipova",
      propertyId: "lipova",
      startDate: isoDate("2029-01-15"),
      initialPrincipal: money("7000000"),
      fixationYears: 5,
      interestRatePa: rate("0.04"),
      monthlyInstalment: money("35000"),
    },
  ],
};

/** The seed with valuations that end (ADR 0122): Javorova's closed in the projection,
 *  Lipova's closed with a gap before the next one, Dubova's closed over an older
 *  open-ended one. */
const closedValuations: Portfolio = {
  ...portfolio,
  valuations: [
    {
      id: "v-javorova",
      propertyId: "javorova",
      validFrom: isoDate("2026-06-01"),
      validTo: isoDate("2027-12-31"),
      marketValue: money("10200000"),
    },
    {
      id: "v-lipova",
      propertyId: "lipova",
      validFrom: isoDate("2026-06-01"),
      validTo: isoDate("2026-12-31"),
      marketValue: money("8925000"),
    },
    {
      id: "v-lipova-2",
      propertyId: "lipova",
      validFrom: isoDate("2029-01-01"),
      marketValue: money("9500000"),
    },
    {
      id: "v-dubova-old",
      propertyId: "dubova",
      validFrom: isoDate("2020-01-01"),
      marketValue: money("6000000"),
    },
    {
      id: "v-dubova",
      propertyId: "dubova",
      validFrom: isoDate("2026-06-01"),
      validTo: isoDate("2028-06-30"),
      marketValue: money("9605000"),
    },
  ],
};

const CASES: [string, Portfolio][] = [
  ["seed", portfolio],
  ["mixed", mixed],
  ["refinanced", refinanced],
];

const sum = (xs: Decimal[]) => xs.reduce((s, x) => s.plus(x), ZERO);
const activeProps = (p: Portfolio) =>
  p.properties.filter((x) => x.active !== false);
const schedulesOf = (p: Portfolio, a: Assumptions = assumptions) =>
  schedulesByProperty(
    p.mortgages,
    p.properties.map((x) => x.id),
    a,
  );

/** New debt raised inside (baseDate, horizon end]: loans that start after baseDate
 *  plus development draws dated after baseDate, less the balances successors pay off
 *  (D-47). The debt comes from the INPUTS, not the schedule, so the conservation
 *  identity is an independent check; only the paid-off balances are read back. */
function newDebtInHorizon(p: Portfolio, propertyId: string): Decimal {
  const blocks = p.mortgages.filter((m) => m.propertyId === propertyId);
  const paidOff = sum(
    propertySchedule(blocks, assumptions)
      .refinances.filter((r) => r.month <= assumptions.horizonYears * 12)
      .map((r) => r.paidOff),
  );
  return raisedInHorizon(p, propertyId).minus(paidOff);
}

function raisedInHorizon(p: Portfolio, propertyId: string): Decimal {
  const end = edate(assumptions.baseDate, assumptions.horizonYears * 12);
  const inWindow = (d: Date) =>
    isAfter(d, assumptions.baseDate) && isOnOrBefore(d, end);
  let total = ZERO;
  for (const b of p.mortgages.filter((m) => m.propertyId === propertyId)) {
    if (inWindow(b.startDate)) total = total.plus(b.initialPrincipal);
    for (const d of b.draws ?? [])
      if (inWindow(d.date)) total = total.plus(d.amount);
  }
  return total;
}

// ---------------------------------------------------------------------------
// 1. Principal conservation (general form)
// ---------------------------------------------------------------------------

describe("Invariant — principal conservation", () => {
  it("seed tripwire: Σ principal (Yrs 1–30) = 9,515,405 and every seed loan repays", () => {
    const kpis = portfolioKpis(portfolio, assumptions);
    near(kpis.totalPrincipalRepaid, PARITY.kpis.totalPrincipalRepaid, KC, "Σ");
    const proj = portfolioProjection(portfolio, assumptions);
    near(proj[assumptions.horizonYears].balance, 0, KC, "horizon balance");
  });

  for (const [name, p] of CASES) {
    const schedules = schedulesOf(p);
    it(`${name}: per property Σ principal = opening + new debt − horizon balance`, () => {
      for (const prop of activeProps(p)) {
        const proj = propertyProjection(
          prop,
          p,
          assumptions,
          schedules.get(prop.id) ?? [],
        );
        const N = assumptions.horizonYears;
        const sumPrincipal = sum(proj.slice(1).map((y) => y.principal));
        const opening = proj[0].balance;
        const expected = opening
          .plus(newDebtInHorizon(p, prop.id))
          .minus(proj[N].balance);
        near(sumPrincipal, expected.toNumber(), KC, `${name}/${prop.id}`);
      }
    });

    it(`${name}: portfolio Σ principal = opening + new debt − horizon balance`, () => {
      const proj = portfolioProjection(p, assumptions);
      const N = assumptions.horizonYears;
      const newDebt = sum(activeProps(p).map((x) => newDebtInHorizon(p, x.id)));
      const expected = proj[0].balance.plus(newDebt).minus(proj[N].balance);
      near(
        sum(proj.slice(1).map((y) => y.principal)),
        expected.toNumber(),
        KC,
        name,
      );
      // The KPI reads the same horizon window as the projection.
      near(
        portfolioKpis(p, assumptions).totalPrincipalRepaid,
        sum(proj.slice(1).map((y) => y.principal)).toNumber(),
        KC,
        `${name} KPI`,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Snapshot at baseDate + N years == projection year N (value, debt, drawn fraction)
// ---------------------------------------------------------------------------

/** Assert snapshot(baseDate + N y) == projection year N for `props`, every owned year. */
function assertSnapshotMatchesProjection(
  p: Portfolio,
  ids: string[],
  field: "value" | "debt",
) {
  const schedules = schedulesOf(p);
  for (const prop of activeProps(p).filter((x) => ids.includes(x.id))) {
    const sched = schedules.get(prop.id) ?? [];
    const proj = propertyProjection(prop, p, assumptions, sched);
    for (let n = 0; n <= assumptions.horizonYears; n++) {
      const asOf = edate(assumptions.baseDate, n * 12);
      const s = propertySnapshot(prop, p, assumptions, asOf, sched);
      if (!s.owned) continue; // pre-purchase years: see characterisation below
      const want = field === "value" ? proj[n].value : proj[n].balance;
      near(s[field], want.toNumber(), KC, `${prop.id} N=${n} ${field}`);
    }
  }
}

const ownedAtBase = (p: Portfolio) =>
  activeProps(p)
    .filter((x) => isOnOrBefore(x.purchaseDate, assumptions.baseDate))
    .map((x) => x.id);

describe("Invariant — snapshot(baseDate + N y) == projection year N", () => {
  for (const [name, p] of CASES) {
    it(`${name}: VALUE matches for properties owned at baseDate, N = 0…horizon`, () =>
      assertSnapshotMatchesProjection(p, ownedAtBase(p), "value"));
    it(`${name}: DEBT matches for every active property, N = 0…horizon`, () =>
      assertSnapshotMatchesProjection(
        p,
        activeProps(p).map((x) => x.id),
        "debt",
      ));
  }

  // ADR 0122: valuations closed by validTo, with a gap and over an older open one.
  it("closed valuations: VALUE matches for every property, N = 0…horizon // ADR 0122", () =>
    assertSnapshotMatchesProjection(
      closedValuations,
      ownedAtBase(closedValuations),
      "value",
    ));

  // D-32 (DR-105): the projection grows a future purchase from its purchase date by whole
  // completed months / 12, as the snapshot does (was: from its turn-on projection year).
  it("mixed: VALUE matches for a future-dated purchase // D-32", () =>
    assertSnapshotMatchesProjection(mixed, ["future"], "value"));

  it("future purchase (2028-03-15) N=2: projection = snapshot 6,341,316.64 // D-32", () => {
    const future = mixed.properties.find((x) => x.id === "future")!;
    const sched = schedulesOf(mixed).get("future")!;
    const proj = propertyProjection(future, mixed, assumptions, sched);
    // 6.3 M × 1.04^(2/12) (was 6,300,000: no growth in the turn-on year, DR-105)
    near(proj[2].value, 6_341_316.64, KC, "projection N=2");
  });

  // D-32 (DR-029): a valuation dated after the basis re-anchors both sides by whole
  // completed months / 12 from its validFrom (was: whole years from its turn-on year).
  const withValuation = (validFrom: string, keepBase: boolean): Portfolio => ({
    ...portfolio,
    valuations: [
      ...portfolio.valuations.filter(
        (v) => keepBase || v.propertyId !== "javorova",
      ),
      {
        id: "v-javorova-2",
        propertyId: "javorova",
        validFrom: isoDate(validFrom),
        marketValue: money("13000000"),
      },
    ],
  });

  it("seed + a later valuation (2027-12-01): VALUE matches // D-32", () =>
    assertSnapshotMatchesProjection(
      withValuation("2027-12-01", true),
      ["javorova"],
      "value",
    ));

  it("only an upcoming valuation (2027-12-01, none in force at baseDate): VALUE matches // D-32", () =>
    assertSnapshotMatchesProjection(
      withValuation("2027-12-01", false),
      ["javorova"],
      "value",
    ));

  it("dev property: both sides scale the value by the same drawnFraction", () => {
    const plain: Portfolio = {
      ...mixed,
      mortgages: mixed.mortgages.map((m) =>
        m.id === "m-dev"
          ? { ...m, draws: undefined, completionDate: undefined }
          : m,
      ),
    };
    const dev = mixed.properties.find((x) => x.id === "dev")!;
    const devProj = propertyProjection(
      dev,
      mixed,
      assumptions,
      schedulesOf(mixed).get("dev")!,
    );
    const plainProj = propertyProjection(
      dev,
      plain,
      assumptions,
      schedulesOf(plain).get("dev")!,
    );
    for (let n = 0; n <= assumptions.horizonYears; n++) {
      const date = edate(assumptions.baseDate, n * 12);
      const f = drawnFraction(devBlock, date);
      near(
        devProj[n].value,
        plainProj[n].value.times(f).toNumber(),
        KC,
        `N=${n}`,
      );
    }
    // Fraction ramps from 2.0/4.5 at baseDate to 1 after the last draw.
    near(drawnFraction(devBlock, assumptions.baseDate), 2 / 4.5, 1e-12);
    near(drawnFraction(devBlock, edate(assumptions.baseDate, 24)), 1, 0);
  });
});

describe("Characterisation — snapshot vs projection are NOT equal for rent/NOI/debt service", () => {
  // The snapshot annualises the lease in force (12 × monthly rent) and 12 × the
  // instalment at asOf; the projection sums indexed rent and the actual payments of the
  // year. Documented here so nobody "fixes" the invariant above to cover them.
  const schedules = schedulesOf(portfolio);
  const lipova = portfolio.properties.find((x) => x.id === "lipova")!;
  const sched = schedules.get("lipova")!;
  const proj = propertyProjection(lipova, portfolio, assumptions, sched);
  const s1 = propertySnapshot(
    lipova,
    portfolio,
    assumptions,
    edate(assumptions.baseDate, 12),
    sched,
  );

  it("Lipova year 1: snapshot annualises the 23,205 lease; projection sums the year's months", () => {
    near(s1.grossAnnualRent, 23_205 * 12, KC, "snapshot rent");
    near(
      proj[1].grossRent,
      2 * 21_675 * 1.03 + 10 * 23_205, // DR-045: steps on the grid
      KC,
      "projection rent",
    );
  });

  it("Lipova year 1: snapshot DS = 12 × instalment; projection DS = Σ payments", () => {
    near(s1.annualDebtService, 25_567.15 * 12, KC, "snapshot DS");
    const paid = sum(
      sched.slice(0, 12).map((r) => r.interest.plus(r.principal)),
    );
    near(proj[1].debtService, paid.toNumber(), KC, "projection DS");
  });

  it("future property before purchase: snapshot still values it, projection shows 0", () => {
    const future = mixed.properties.find((x) => x.id === "future")!;
    const sched2 = schedulesOf(mixed).get("future")!;
    const s = propertySnapshot(
      future,
      mixed,
      assumptions,
      assumptions.baseDate,
      sched2,
    );
    const p0 = propertyProjection(future, mixed, assumptions, sched2)[0];
    expect(s.owned).toBe(false);
    expect(s.value.greaterThan(ZERO)).toBe(true);
    expect(p0.value.isZero()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Schedule sanity: balance ≥ 0, principal ≤ opening balance, plain loans non-increasing
// ---------------------------------------------------------------------------

/** New principal landing in schedule month `row` according to the INPUTS: a loan start
 *  or a draw dated in (previous grid date, this grid date] (buildSchedule buckets a
 *  dated event into the first grid month on/after it). */
function landedInRow(block: MortgageBlock, row: AmortizationRow): Decimal {
  const prevDate = edate(assumptions.baseDate, row.month - 1);
  const inBucket = (d: Date) =>
    isAfter(d, prevDate) && isOnOrBefore(d, row.date);
  let total = inBucket(block.startDate) ? block.initialPrincipal : ZERO;
  for (const d of block.draws ?? [])
    if (inBucket(d.date)) total = total.plus(d.amount);
  return total;
}

describe("Invariant — schedule sanity", () => {
  for (const [name, p] of CASES) {
    for (const block of p.mortgages) {
      it(`${name}/${block.id}: balance ≥ 0 and principal ≤ opening balance every month`, () => {
        const rows = schedulesOf(p).get(block.propertyId)!;
        rows.forEach((r, i) => {
          expect(r.endBalance.gte(ZERO), `m${r.month} balance`).toBe(true);
          if (i === 0) return; // month-1 opening is only known via the schedule itself
          const available = rows[i - 1].endBalance.plus(landedInRow(block, r));
          expect(r.principal.lte(available), `m${r.month} principal`).toBe(
            true,
          );
        });
      });
      if (!isDevLoan(block)) {
        it(`${name}/${block.id}: plain-loan balance is non-increasing once drawn, except where a successor draws`, () => {
          const rows = schedulesOf(p).get(block.propertyId)!;
          // A successor's draw month may raise the balance (a cash-out refinance, D-47).
          const handovers = new Set(
            propertySchedule(
              p.mortgages.filter((m) => m.propertyId === block.propertyId),
              assumptions,
            ).refinances.map((r) => r.month),
          );
          const drawnFrom = rows.findIndex((r) =>
            r.endBalance.greaterThan(ZERO),
          );
          for (let i = Math.max(drawnFrom, 0) + 1; i < rows.length; i++) {
            if (handovers.has(rows[i].month)) continue;
            expect(
              rows[i].endBalance.lte(rows[i - 1].endBalance),
              `m${rows[i].month}`,
            ).toBe(true);
          }
        });
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 4. Determinism, immutability, scenarios
// ---------------------------------------------------------------------------

/** Structural fingerprint that also sees Date/Decimal internals (freezing a Date does not
 *  stop setUTCDate, so compare values before/after instead of relying on freeze alone). */
function fingerprint(x: unknown): string {
  return JSON.stringify(x, (_k, v) =>
    v instanceof Date ? `D:${v.getTime()}` : v,
  );
}

function deepFreeze<T>(x: T): T {
  if (x && typeof x === "object" && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x as object)) deepFreeze(v);
  }
  return x;
}

function runAll(p: Portfolio, a: Assumptions) {
  const schedules = schedulesOf(p, a);
  return {
    snapshot: portfolioSnapshot(p, a, a.baseDate, schedules),
    snapshotLater: portfolioSnapshot(p, a, edate(a.baseDate, 30), schedules),
    projection: portfolioProjection(p, a),
    kpis: portfolioKpis(p, a),
    schedules: [...schedules.entries()],
  };
}

const shockScenario = {
  appreciationPa: rate("0.01"),
  inflationShock: { deltaPa: rate("0.03"), durationYears: 3 },
  rateShock: { deltaPa: rate("0.02"), durationYears: 2 },
  valueShock: { pct: rate("0.15"), atYear: 2 },
};

describe("Invariant — determinism and immutability", () => {
  for (const [name, p] of CASES) {
    it(`${name}: same inputs ⇒ deep-equal outputs`, () => {
      expect(runAll(p, assumptions)).toEqual(runAll(p, assumptions));
    });

    it(`${name}: deep-frozen inputs are neither mutated nor cause a throw`, () => {
      const P = deepFreeze(rebuild(p));
      const A = deepFreeze(applyScenario(rebuildAssumptions(), shockScenario));
      const before = fingerprint([P, A]);
      expect(() => runAll(P, A)).not.toThrow();
      expect(fingerprint([P, A])).toBe(before);
    });
  }

  it("applyScenario never mutates its inputs", () => {
    const base = rebuildAssumptions();
    const overrides = { ...shockScenario };
    const before = fingerprint([base, overrides]);
    const out = applyScenario(base, overrides);
    expect(fingerprint([base, overrides])).toBe(before);
    expect(out).not.toBe(base);
  });

  it("Base scenario (no overrides) == no scenario, for every output", () => {
    for (const [, p] of CASES) {
      expect(runAll(p, applyScenario(assumptions, {}))).toEqual(
        runAll(p, assumptions),
      );
    }
  });
});

// Fresh deep copies with real Decimal/Date instances (so freezing never touches the
// shared fixture objects used by other tests).
function rebuild(p: Portfolio): Portfolio {
  const copy = <T extends object>(o: T): T =>
    Object.fromEntries(
      Object.entries(o).map(([k, v]) => [k, cloneValue(v)]),
    ) as T;
  return {
    properties: p.properties.map(copy),
    mortgages: p.mortgages.map(copy),
    valuations: p.valuations.map(copy),
    leases: p.leases.map(copy),
    holdingCosts: p.holdingCosts.map(copy),
  };
}
function rebuildAssumptions(): Assumptions {
  return {
    ...assumptions,
    baseDate: new Date(assumptions.baseDate.getTime()) as IsoDate,
    defaults: { ...assumptions.defaults },
  };
}
function cloneValue(v: unknown): unknown {
  if (v instanceof Date) return new Date(v.getTime());
  if (Array.isArray(v)) return v.map(cloneValue);
  if (v && typeof v === "object" && !(v as { toFixed?: unknown }).toFixed)
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, cloneValue(x)]),
    );
  return v; // Decimal instances are immutable by design; share them
}
