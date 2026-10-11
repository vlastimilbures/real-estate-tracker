// P4a golden master: full-precision engine output (40 significant digits, no tolerance)
// for the seed, the mixed fixture and the edge portfolios the P3 suites exercise. The
// structural refactor must leave every hash unchanged. A snapshot may be updated only by
// an approved decision (P4b), never to make a refactor pass.
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { D, Decimal } from "../../lib/money";
import { rate } from "../brands";
import { edate, isoDate } from "../dates";
import {
  amortizationHealth,
  currentBalance,
  drawMonth,
  scheduleMonths,
  termMonths,
} from "../amortization";
import {
  buildSchedule,
  EMPTY_PROPERTY_SCHEDULE,
  propertySchedules,
  scheduleRows,
  undrawnPrincipal,
} from "../schedule";
import { portfolioSnapshot, propertySnapshot } from "../metrics";
import { portfolioSnapshotAtYear, realProjection } from "../real";
import { portfolioOutputs } from "../outputs";
import { financingExposure } from "../financing";
import {
  cpiIndex,
  portfolioProjection,
  propertyProjection,
} from "../projections";
import { irr, portfolioKpis } from "../kpis";
import { EngineInputError } from "../errors";
import { applyScenario, type ScenarioOverrides } from "../scenarios";
import type { Assumptions, MortgageBlock, Portfolio } from "../types";
import {
  assumptions as seedAssumptions,
  portfolio as seed,
} from "./support/seed";
import { devBlock, mixed } from "./support/mixed";
import { mixedCashOutside, mixedWithRefi } from "./support/synthetic";
import { withEvents } from "./support/events";
import { money } from "../brands";

// Fields added after the golden master was recorded: D-22's (pinned in
// year-periods.test.ts), DR-092's `drawn` / `draws` (pinned in draws.test.ts against
// the balances hashed here), DR-158's IRR reasons (pinned in irr-edge.test.ts) and
// ADR 0087's real-lens KPIs (pinned in real-kpis.test.ts), ADR 0103's total interest
// (pinned in total-interest.test.ts), ADR 0109's prepayment fields and event
// outcomes (pinned in loan-events.test.ts; zero or empty without events) and ADR 0130's
// `refinanced` (pinned in refinance-difference.test.ts) and ADR 0161's `cashToOwner`
// (pinned in cash-to-owner.test.ts against the KPIs hashed here) and ADR 0164's
// amortization `dueDate` (pinned in due-date.test.ts) and ADR 0165's `acquiredValue`
// (pinned in acquired-value.test.ts). Leaving them
// out keeps every hash comparable (no number moved). Frozen by ADR 0174: a new field is
// not added here; the v2 cases below hash it.
const ADDED_FIELDS = new Set([
  "committedDebt",
  "committedDraws",
  "totalCommittedDebt",
  "periodStart",
  "periodEnd",
  "firstCashFlowPositiveProjectionYear",
  "debtFreeProjectionYear",
  "drawn",
  "draws",
  "refinanced",
  "leveredIrrNominalReason",
  "leveredIrrRealReason",
  "netWorthMultipleReal",
  "cumulativeNetCashFlowReal",
  "totalInterest",
  "totalInterestReal",
  "prepaid",
  "prepaymentFee",
  "prepaymentFees",
  "eventOutcomes",
  "cashToOwner",
  "dueDate",
  "acquiredValue",
  "undrawnDebt",
  "reportedValue",
  "totalUndrawnDebt",
  "totalReportedValue",
]);

function canon(v: unknown): unknown {
  if (v === null || v === undefined) return v ?? null;
  if (Decimal.isDecimal(v)) return (v as Decimal).toString();
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Map) {
    return [...v.entries()]
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([k, x]) => [k, canon(x)]);
  }
  if (Array.isArray(v)) return v.map(canon);
  if (typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as object)
        .filter((k) => !ADDED_FIELDS.has(k))
        .sort()
        .map((k) => [k, canon((v as Record<string, unknown>)[k])]),
    );
  }
  if (typeof v === "number" && !Number.isFinite(v)) return String(v);
  return v;
}

const hash = (v: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canon(v)))
    .digest("hex");

/** `run()`, or the error codes it raises (D-19 early as-of, D-37 corrupt data). */
function orCodes<T>(run: () => T): T | string {
  try {
    return run();
  } catch (e) {
    if (!(e instanceof EngineInputError)) throw e;
    return e.errors.map((x) => x.code).join(",");
  }
}

/** Hash of `run()`, or the error codes it raises. */
function hashOrCodes(run: () => unknown): string {
  const out = orCodes(run);
  return typeof out === "string" ? out : hash(out);
}

/** Everything the engine produces for one portfolio + assumptions pair. */
function fullRun(portfolio: Portfolio, a: Assumptions) {
  const ids = portfolio.properties.map((p) => p.id);
  const fullSchedules = propertySchedules(portfolio.mortgages, ids, a);
  const schedules = scheduleRows(fullSchedules);
  const asOfs = [
    a.baseDate,
    edate(a.baseDate, 1),
    isoDate("2026-08-31"),
    isoDate("2026-09-01"),
    edate(a.baseDate, 12 * 5),
    edate(a.baseDate, 12 * a.horizonYears),
    isoDate("2024-01-01"),
  ];
  const snapshotsWithSchedules = asOfs.map((d) =>
    hashOrCodes(() => portfolioSnapshot(portfolio, a, d, schedules)),
  );
  // DR-118: an omitted schedule is built from the same inputs (not hashed again).
  expect(
    asOfs.map((d) => hashOrCodes(() => portfolioSnapshot(portfolio, a, d))),
  ).toEqual(snapshotsWithSchedules);
  return {
    schedules: hash(schedules),
    snapshotsWithSchedules,
    propertyProjections: portfolio.properties.map((p) =>
      hash(
        propertyProjection(
          p,
          portfolio,
          a,
          fullSchedules.get(p.id) ?? EMPTY_PROPERTY_SCHEDULE,
        ),
      ),
    ),
    projection: hash(portfolioProjection(portfolio, a)),
    kpis: canon(portfolioKpis(portfolio, a)),
    cpi: hash(cpiIndex(a)),
  };
}

const shocks: Record<string, ScenarioOverrides> = {
  levels: {
    appreciationPa: rate("0.02"),
    rentIndexationPa: rate("0.01"),
    vacancyAllowance: rate("0.1"),
    postFixationResetRatePa: rate("0.06"),
    inflationPa: rate("0.04"),
  },
  inflationShock: {
    inflationShock: { deltaPa: rate("0.05"), durationYears: 3 },
  },
  rateShock: { rateShock: { deltaPa: rate("0.02"), durationYears: 2 } },
  valueShock: { valueShock: { pct: rate("0.2"), atYear: 5 } },
  valueShockYear0: { valueShock: { pct: rate("0.1"), atYear: 0 } },
};

const base = (b: Partial<MortgageBlock>): MortgageBlock =>
  ({
    id: "x",
    propertyId: "javorova",
    startDate: isoDate("2021-01-31"),
    initialPrincipal: money("3000000"),
    fixationYears: 3,
    interestRatePa: rate("0.029"),
    monthlyInstalment: money("15000"),
    ...b,
  }) as MortgageBlock;

/** Loans that hit every branch of the schedule loops. */
const edgeLoans: Record<string, MortgageBlock> = {
  monthEndPastFixation: base({}),
  zeroRate: base({
    interestRatePa: rate("0"),
    monthlyInstalment: money("20000"),
  }),
  explicitTerm: base({ loanTermYears: 25, monthlyInstalment: money("9000") }),
  firstGridMonth: base({ startDate: isoDate("2026-06-20") }), // D-33 (DR-106): opens at 0
  futureMonthEnd: base({ startDate: isoDate("2027-01-31"), fixationYears: 5 }),
  devRunning: devBlock,
  devFuture: base({
    startDate: isoDate("2026-09-01"),
    fixationYears: 10,
    interestRatePa: rate("0.05"),
    loanTermYears: 30,
    draws: [
      { date: isoDate("2027-03-01"), amount: money("1500000") },
      { date: isoDate("2027-09-01"), amount: money("2000000") },
    ],
    completionDate: isoDate("2027-12-01"),
  }),
  devDrawsOnly: base({
    startDate: isoDate("2025-02-28"),
    loanTermYears: 20,
    draws: [
      { date: isoDate("2025-10-31"), amount: money("500000") },
      { date: isoDate("2026-07-15"), amount: money("700000") },
      { date: isoDate("2026-07-20"), amount: money("100000") },
    ],
  }),
  devIoPastCompletion: base({
    startDate: isoDate("2023-04-10"),
    loanTermYears: 30,
    completionDate: isoDate("2025-12-31"),
  }),
  devDrawLostStepsZero: base({
    startDate: isoDate("2026-05-20"), // DR-016 (fixed by D-41): steps = 0 at baseDate
    loanTermYears: 30,
    draws: [{ date: isoDate("2026-06-01"), amount: money("400000") }],
  }),
};

describe("P4a golden master (full precision)", () => {
  it("seed", () => {
    expect(fullRun(seed, seedAssumptions)).toMatchSnapshot();
  });

  it("mixed fixture", () => {
    expect(fullRun(mixed, seedAssumptions)).toMatchSnapshot();
  });

  it("mixed fixture with acquisition costs", () => {
    const a = { ...seedAssumptions, acquisitionCostPct: rate("0.04") };
    expect(fullRun(mixed, a)).toMatchSnapshot();
  });

  it("mixed fixture with a funding record (ADR 0119)", () => {
    // The future buy's recorded own cash replaces its derived down payment. Only the
    // KPIs can differ from "mixed fixture": the record moves no projection row.
    const funded = {
      ...mixed,
      properties: mixed.properties.map((p) =>
        p.id === "future"
          ? {
              ...p,
              funding: {
                ownCash: money("2125000.5"),
                transactionCosts: money("95000"),
                initialWorks: money("230000"),
              },
            }
          : p,
      ),
    };
    expect(fullRun(funded, seedAssumptions).kpis).toMatchSnapshot();
  });

  it.each(Object.keys(shocks))("scenario %s on seed and mixed", (name) => {
    const a = applyScenario(seedAssumptions, shocks[name]);
    expect({
      seed: fullRun(seed, a),
      mixed: fullRun(mixed, a),
    }).toMatchSnapshot();
  });

  it.each(Object.keys(edgeLoans))("edge loan %s", (name) => {
    const block = edgeLoans[name];
    const shocked = applyScenario(seedAssumptions, shocks.rateShock);
    expect({
      term: termMonths(block),
      drawMonth: drawMonth(block, seedAssumptions.baseDate),
      scheduleMonths: scheduleMonths(block, seedAssumptions),
      schedule: hash(buildSchedule(block, seedAssumptions)),
      scheduleShocked: hash(buildSchedule(block, shocked)),
      health: canon(amortizationHealth(block)),
      balances: [0, 1, 17, 64, 120].map((m) =>
        currentBalance(block, edate(block.startDate, m)).toString(),
      ),
      undrawn: [0, 3, 9, 15, 24].map((m) =>
        undrawnPrincipal(
          seed.properties[0]!,
          [block],
          seedAssumptions,
          m,
        ).toString(),
      ),
    }).toMatchSnapshot();
  });

  it("edge loans inside a portfolio (projection, snapshot, KPIs)", () => {
    const out = Object.fromEntries(
      Object.entries(edgeLoans).map(([name, block]) => {
        const p: Portfolio = {
          ...seed,
          mortgages: [
            ...seed.mortgages.filter((m) => m.propertyId !== "javorova"),
            block,
          ],
        };
        // devRunning belongs to no seed property: ORPHAN_ROW (D-37).
        return [name, orCodes(() => fullRun(p, seedAssumptions))];
      }),
    );
    expect(out).toMatchSnapshot();
  });

  // Name kept so the golden key stays stable: since DR-118 there is no closed form and
  // the omitted schedule is built inside.
  it("snapshot per property at baseDate (closed form)", () => {
    expect(
      seed.properties.map((p) =>
        hash(propertySnapshot(p, seed, seedAssumptions)),
      ),
    ).toMatchSnapshot();
  });

  it("irr samples", () => {
    const vectors = [
      [D(-100), D(10), D(10), D(110)],
      [D(-1), D(10)],
      [D(-100), D(230), D(-132)],
      [D(-1000), D(0), D(0), D(0), D(2000)],
    ];
    expect(vectors.map((v) => canon(irr(v)))).toMatchSnapshot();
  });

  it("horizon lengths 1 and 5", () => {
    expect(
      [1, 5].map((h) =>
        fullRun(mixed, { ...seedAssumptions, horizonYears: h }),
      ),
    ).toMatchSnapshot();
  });
});

// ADR 0174: v2 cases hash every field (no ADDED_FIELDS), one hash per leaf path, so a new
// output field shows as added snapshot lines only and a changed line means a number moved.

/** A plain record (not a Decimal, Date or Map). */
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" &&
  v !== null &&
  !Array.isArray(v) &&
  !(v instanceof Map) &&
  !(v instanceof Date) &&
  !Decimal.isDecimal(v);

/** Every leaf of `v` under its path (array indices dropped, `[]` marks an array), with
 *  the indices it was found at. An empty array or record is a leaf of its own, so a
 *  section that fills or empties changes a line rather than only adding one. */
function leaves(
  v: unknown,
  path: string,
  at: number[],
  out: Map<string, [number[], unknown][]>,
): void {
  const push = (p: string, x: unknown) => {
    const list = out.get(p) ?? [];
    list.push([at, x]);
    out.set(p, list);
  };
  if (v instanceof Map) {
    if (v.size === 0) return push(path, "{}");
    for (const [k, x] of v) leaves(x, `${path}.${String(k)}`, at, out);
  } else if (Array.isArray(v)) {
    if (v.length === 0) return push(path, "[]");
    v.forEach((x, i) => leaves(x, `${path}[]`, [...at, i], out));
  } else if (isRecord(v)) {
    const keys = Object.keys(v);
    if (keys.length === 0) return push(path, "{}");
    for (const k of keys) leaves(v[k], path ? `${path}.${k}` : k, at, out);
  } else push(path, canon(v));
}

/** One sha256 per leaf path of `v`; error codes as they are. */
function fieldHashes(v: unknown): Record<string, string> | string {
  if (typeof v === "string") return v;
  const out = new Map<string, [number[], unknown][]>();
  leaves(v, "", [], out);
  return Object.fromEntries(
    [...out]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([p, xs]) => [
        p || "(value)",
        createHash("sha256").update(JSON.stringify(xs)).digest("hex"),
      ]),
  );
}

/** Everything the engine produces for one portfolio + assumptions pair, per field. */
function fullRunV2(portfolio: Portfolio, a: Assumptions) {
  const ids = portfolio.properties.map((p) => p.id);
  const built = propertySchedules(portfolio.mortgages, ids, a);
  const schedules = scheduleRows(built);
  const asOfs = [
    a.baseDate,
    edate(a.baseDate, 1),
    isoDate("2026-08-31"),
    isoDate("2026-09-01"),
    edate(a.baseDate, 12 * 5),
    edate(a.baseDate, 12 * a.horizonYears),
    isoDate("2024-01-01"),
  ];
  const projection = portfolioProjection(portfolio, a);
  const cpi = cpiIndex(a);
  const snapshot = portfolioSnapshot(portfolio, a, a.baseDate, schedules);
  const later = [a.baseDate, edate(a.baseDate, 12 * 5)];
  const financing = Object.fromEntries(
    later.map((d) => [d.getTime(), financingExposure(portfolio, a, built, d)]),
  );
  // The one-pass outputs the UI reads are the parts hashed here (DR-042), so they are
  // compared, not hashed again.
  for (const d of later)
    expect(portfolioOutputs(portfolio, a, d)).toEqual({
      schedules,
      snapshot: portfolioSnapshot(portfolio, a, d, schedules),
      projection,
      kpis: portfolioKpis(portfolio, a),
      financing: financing[d.getTime()],
    });
  return {
    schedules: fieldHashes(built),
    snapshots: Object.fromEntries(
      asOfs.map((d) => [
        d.toISOString().slice(0, 10),
        fieldHashes(
          orCodes(() => portfolioSnapshot(portfolio, a, d, schedules)),
        ),
      ]),
    ),
    propertyProjections: Object.fromEntries(
      portfolio.properties.map((p) => [
        p.id,
        fieldHashes(
          propertyProjection(
            p,
            portfolio,
            a,
            built.get(p.id) ?? EMPTY_PROPERTY_SCHEDULE,
          ),
        ),
      ]),
    ),
    projection: fieldHashes(projection),
    kpis: fieldHashes(portfolioKpis(portfolio, a)),
    cpi: fieldHashes(cpi),
    realProjection: fieldHashes(realProjection(projection, cpi)),
    snapshotAtYear: Object.fromEntries(
      [0, 5, a.horizonYears].map((y) => [
        y,
        fieldHashes(portfolioSnapshotAtYear(snapshot, projection[y]!)),
      ]),
    ),
    financing: Object.fromEntries(
      later.map((d) => [
        d.toISOString().slice(0, 10),
        fieldHashes(financing[d.getTime()]),
      ]),
    ),
  };
}

/** The loan events of ADR 0109 on the refinance fixture, plus Dubová's second recast
 *  in the instalment form (both recast forms run). */
const eventsWithRefi: Portfolio = (() => {
  const p = withEvents(mixedWithRefi);
  return {
    ...p,
    mortgages: p.mortgages.map((m) =>
      m.id === "m-dubova"
        ? {
            ...m,
            recasts: [
              ...(m.recasts ?? []),
              { date: edate(m.startDate, 180), instalment: money("25000") },
            ],
          }
        : m,
    ),
  };
})();

describe("golden master v2 (every field, per field; ADR 0174)", () => {
  it("the event fixture is not vacuous", () => {
    const a = seedAssumptions;
    const built = propertySchedules(
      eventsWithRefi.mortgages,
      eventsWithRefi.properties.map((p) => p.id),
      a,
    );
    const outcomes = [...built.values()].flatMap((s) => s.eventOutcomes);
    const planned = eventsWithRefi.mortgages.reduce(
      (n, m) => n + (m.prepayments?.length ?? 0) + (m.recasts?.length ?? 0),
      0,
    );
    expect(outcomes).toHaveLength(planned);
    const applied = (kind: string, form?: "instalment") =>
      outcomes.some(
        (o) =>
          o.kind === kind &&
          o.issue === null &&
          o.month !== null &&
          o.month > 0 &&
          (form === undefined ||
            eventsWithRefi.mortgages.some(
              (m) =>
                m.id === o.blockId &&
                m.recasts?.some(
                  (r) =>
                    r.instalment !== undefined &&
                    r.date.getTime() === o.date.getTime(),
                ),
            )),
      );
    expect(applied("prepayment")).toBe(true);
    expect(applied("recast")).toBe(true);
    expect(applied("recast", "instalment")).toBe(true);
    const rows = [...built.values()].flatMap((s) => s.rows);
    expect(rows.reduce((t, r) => t.plus(r.prepaid), D(0)).gt(0)).toBe(true);
    expect(rows.reduce((t, r) => t.plus(r.prepaymentFee), D(0)).gt(0)).toBe(
      true,
    );
    expect(built.get("javorova")?.refinances).toHaveLength(1);
  });

  const cases: [string, Portfolio][] = [
    ["events with a refinance", eventsWithRefi],
    ["cash-outside prepayment on a future buy", mixedCashOutside],
  ];
  const lenses: [string, Assumptions][] = [
    ["base", seedAssumptions],
    [
      "rate and inflation shock",
      applyScenario(
        applyScenario(seedAssumptions, shocks.rateShock!),
        shocks.inflationShock!,
      ),
    ],
  ];
  for (const [name, p] of cases)
    for (const [lens, a] of lenses)
      it(`${name}, ${lens}`, () => {
        expect(fullRunV2(p, a)).toMatchSnapshot();
      });
});
