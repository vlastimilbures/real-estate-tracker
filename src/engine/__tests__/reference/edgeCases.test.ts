// P02 Part A.3 — edge cases run through BOTH the engine and the independent reference
// model. Where they agree the test asserts agreement; where the engine differs, the test
// asserts TODAY's engine output next to the reference value, tagged with the DR/J ID
// that tracks it (CLAUDE.md §6). The reference runs on the engine's
// calendar, J-03 a′ (D-21): baseDate grid rows, rate keyed on each payment's due date.

import { describe, it, expect } from "vitest";
import { currentBalance, termMonths } from "../../amortization";
import { EngineInputError } from "../../errors";
import {
  buildSchedule,
  balanceAtMonth,
  propertySchedule,
  schedulesByProperty,
} from "../../schedule";
import { portfolioSnapshot } from "../../metrics";
import { portfolioProjection } from "../../projections";
import { isoDate } from "../../dates";
import { D } from "../../../lib/money";
import type { Assumptions, MortgageBlock, AmortizationRow } from "../../types";
import { assumptions as A0, portfolio as P0 } from "../support/seed";
import {
  annuityPayment,
  referenceBalanceAt,
  referenceChain,
  referenceSchedule,
  termOf,
  type RefLoan,
  type RefOptions,
  type RefRow,
} from "./mortgageReference";
import { RESET, SEED_LOANS } from "./seedLoans";
import { rate } from "../../brands";
import { money } from "../../brands";

const TIGHT = 1e-6; // Kč
const CENT = 0.01; // Kč, for quoted engine/reference figures

function toBlock(l: RefLoan, id = "x", propertyId = "p"): MortgageBlock {
  return {
    id,
    propertyId,
    startDate: isoDate(l.start),
    initialPrincipal: money(String(l.principal)),
    fixationYears: l.fixationMonths / 12,
    interestRatePa: rate(String(l.ratePa)),
    monthlyInstalment: money(String(l.instalment)),
    loanTermYears: l.termMonths != null ? l.termMonths / 12 : undefined,
    draws: l.draws?.map((x) => ({
      date: isoDate(x.date),
      amount: money(String(x.amount)),
    })),
    completionDate: l.completion ? isoDate(l.completion) : undefined,
  } as MortgageBlock;
}

const at = (base: string, extra: Partial<Assumptions> = {}): Assumptions => ({
  ...A0,
  baseDate: isoDate(base),
  ...extra,
});

function both(
  l: RefLoan,
  base = "2026-06-07",
  opts: Partial<RefOptions> = {},
  extra: Partial<Assumptions> = {},
): { e: AmortizationRow[]; r: RefRow[] } {
  const e = buildSchedule(toBlock(l), at(base, extra));
  const r = referenceSchedule(l, {
    baseDate: base,
    months: e.length,
    resetRatePa: RESET,
    calendar: "gridDueDate",
    devInstalment: "fromTerm", // D-31
    openingDraws: "nextPeriod", // D-41
    ...opts,
  });
  return { e, r };
}

const opening = (e: AmortizationRow[]) =>
  e[0].endBalance.plus(e[0].principal).toNumber();
const refOpening = (r: RefRow[]) =>
  r[0].endBalance.plus(r[0].principal).minus(r[0].draw).toNumber();

/** Max |Δ| over all columns. The instalment column is compared only on months the
 *  reference collects a payment (a scheduled-but-unpaid instalment is not cash). */
function maxDev(e: AmortizationRow[], r: RefRow[]): number {
  let m = 0;
  for (let i = 0; i < Math.min(e.length, r.length); i++) {
    const cols = ["ratePa", "interest", "principal", "endBalance"] as const;
    for (const c of cols) {
      m = Math.max(m, Math.abs(e[i][c].minus(r[i][c].toString()).toNumber()));
    }
    if (r[i].payment.greaterThan(0)) {
      m = Math.max(
        m,
        Math.abs(e[i].instalment.minus(r[i].instalment.toString()).toNumber()),
      );
    }
  }
  return m;
}

describe("edge cases where engine and reference agree", () => {
  const cases: [
    string,
    RefLoan,
    string?,
    Partial<RefOptions>?,
    Partial<Assumptions>?,
  ][] = [
    [
      "rate 0 %",
      {
        start: "2024-01-10",
        principal: "2400000",
        ratePa: "0",
        instalment: "10000",
        fixationMonths: 60,
      },
    ],
    [
      "rate 12 %",
      {
        start: "2024-01-10",
        principal: "3000000",
        ratePa: "0.12",
        instalment: "40000",
        fixationMonths: 60,
      },
    ],
    [
      "term 24 months",
      {
        start: "2025-09-10",
        principal: "500000",
        ratePa: "0.05",
        instalment: "22000",
        fixationMonths: 24,
        termMonths: 24,
      },
    ],
    [
      "term 480 months",
      {
        start: "2025-09-10",
        principal: "5000000",
        ratePa: "0.05",
        instalment: "24110",
        fixationMonths: 60,
        termMonths: 480,
      },
    ],
    [
      "fixation end exactly on baseDate",
      {
        start: "2019-06-07",
        principal: "3000000",
        ratePa: "0.02",
        instalment: "12000",
        fixationMonths: 84,
      },
    ],
    [
      "fixation end on the 31st",
      {
        start: "2021-08-31",
        principal: "3000000",
        ratePa: "0.02",
        instalment: "12000",
        fixationMonths: 60,
      },
    ],
    [
      "start on 29 Feb (fixation after baseDate)",
      {
        start: "2024-02-29",
        principal: "3000000",
        ratePa: "0.03",
        instalment: "14000",
        fixationMonths: 60,
      },
    ],
    [
      "loan starting after baseDate",
      {
        start: "2027-01-10",
        principal: "3000000",
        ratePa: "0.04",
        instalment: "15000",
        fixationMonths: 60,
      },
    ],
    [
      "loan already repaid",
      {
        start: "1995-01-01",
        principal: "1000000",
        ratePa: "0.05",
        instalment: "20000",
        fixationMonths: 60,
      },
    ],
    [
      "development loan: draws before and after completion (J-06 landing)",
      {
        start: "2025-10-01",
        principal: "1000000",
        ratePa: "0.05",
        instalment: "5000",
        fixationMonths: 60,
        termMonths: 360,
        draws: [
          { date: "2026-03-01", amount: "500000" },
          { date: "2026-11-15", amount: "800000" },
          { date: "2027-06-15", amount: "300000" },
        ],
        completion: "2027-03-31",
      },
    ],
    [
      "draw landing on the fixation-end date (consistent instalment)",
      {
        start: "2021-09-07",
        principal: "2000000",
        ratePa: "0.03",
        instalment: annuityPayment(0.03 / 12, 360, 2000000).toString(),
        fixationMonths: 60,
        termMonths: 360,
        draws: [{ date: "2026-09-07", amount: "200000" }],
      },
    ],
    [
      "rate shock pushing the reset rate to 12.5 % (J-15 b, fixation-end anchor)",
      SEED_LOANS.javorova,
      "2026-06-07",
      { rateShock: { deltaPa: "0.08", months: 24, anchor: "fixationEnd" } },
      { rateShock: { deltaPa: rate("0.08"), durationYears: 2 } },
    ],
  ];
  for (const [label, loan, base, opts, extra] of cases) {
    it(label, () => {
      const { e, r } = both(loan, base, opts, extra);
      expect(maxDev(e, r)).toBeLessThanOrEqual(TIGHT);
    });
  }

  it("rate shock: interest never exceeds the (re-amortized) instalment", () => {
    const { e } = both(
      SEED_LOANS.javorova,
      "2026-06-07",
      {},
      {
        rateShock: { deltaPa: rate("0.08"), durationYears: 2 },
      },
    );
    for (const row of e) {
      expect(row.principal.isNegative()).toBe(false);
      if (row.endBalance.plus(row.principal).greaterThan(0)) {
        expect(row.interest.lessThanOrEqualTo(row.instalment)).toBe(true);
      }
    }
  });
});

describe("invalid inputs: both reject (D-17)", () => {
  const dubova = SEED_LOANS.dubova;
  it("instalment ≤ first-month interest (DR-014)", () => {
    const l = { ...dubova, instalment: "11050" };
    expect(() => termOf(l)).toThrow(RangeError);
    expect(() => termMonths(toBlock(l))).toThrow(EngineInputError);
    expect(() => buildSchedule(toBlock(l), A0)).toThrow(EngineInputError);
  });
  it("0 % with a 0 instalment (DR-018)", () => {
    const l = { ...dubova, ratePa: "0", instalment: "0" };
    expect(() => termOf(l)).toThrow(RangeError);
    expect(() => termMonths(toBlock(l))).toThrow(EngineInputError);
    expect(() => buildSchedule(toBlock(l), A0)).toThrow(EngineInputError);
  });
  it("development loan without a term", () => {
    const l = { ...dubova, completion: "2026-12-31" };
    expect(() => termOf(l)).toThrow(RangeError);
    expect(() => termMonths(toBlock(l))).toThrow(EngineInputError);
  });
});

describe("fixed by D-21 (J-03 a′): payments counted and priced by due date", () => {
  it("C-22: loan started on the 31st, baseDate 28 Feb — the payment due 28 Feb counts (DR-070)", () => {
    const l: RefLoan = {
      start: "2021-01-31",
      principal: "3000000",
      ratePa: "0.02",
      instalment: "12000",
      fixationMonths: 120,
    };
    const { e, r } = both(l, "2026-02-28");
    expect(Math.abs(opening(e) - 2550932.96)).toBeLessThanOrEqual(CENT); // 61 payments
    expect(Math.abs(refOpening(r) - 2550932.96)).toBeLessThanOrEqual(CENT);
    expect(maxDev(e, r)).toBeLessThanOrEqual(TIGHT);
  });

  it("C-22: loan started on 29 Feb, baseDate 28 Feb next year (DR-070)", () => {
    const l: RefLoan = {
      start: "2024-02-29",
      principal: "3000000",
      ratePa: "0.03",
      instalment: "14000",
      fixationMonths: 60,
    };
    const { e, r } = both(l, "2025-02-28");
    expect(Math.abs(opening(e) - 2920918.51)).toBeLessThanOrEqual(CENT); // 12 payments
    expect(Math.abs(refOpening(r) - 2920918.51)).toBeLessThanOrEqual(CENT);
    expect(maxDev(e, r)).toBeLessThanOrEqual(TIGHT);
  });

  it("C-06: the payment due on the fixation end is at the fixed rate; reset from the next (DR-101)", () => {
    const e = buildSchedule(P0.mortgages[0], A0);
    const pd = referenceSchedule(SEED_LOANS.javorova, {
      baseDate: "2026-06-07",
      months: 360,
      resetRatePa: RESET,
      calendar: "paymentDay",
    });
    // Grid month 56 (2031-02-07) is payment #120, due 2031-01-17 = the fixation end.
    expect(e[55].ratePa.toString()).toBe("0.0169");
    expect(e[56].ratePa.toString()).toBe("0.045");
    expect(pd[55].date).toBe("2031-01-17");
    expect(pd[55].ratePa.toString()).toBe("0.0169");
    expect(e[56].instalment.toFixed(2)).toBe("8681.46");
    // Lifetime interest: the grid now equals the payment-day calendar, per loan.
    const sumI = (rows: { interest: { toString(): string } }[]) =>
      rows.reduce((s, x) => s.plus(x.interest.toString()), D(0));
    for (const b of P0.mortgages) {
      const grid = buildSchedule(b, A0);
      const pay = referenceSchedule(SEED_LOANS[b.propertyId], {
        baseDate: "2026-06-07",
        months: 360,
        resetRatePa: RESET,
        calendar: "paymentDay",
      });
      expect(sumI(grid).minus(sumI(pay)).abs().toNumber()).toBeLessThanOrEqual(
        TIGHT,
      );
    }
  });
});

describe("fixed by D-30: the opening replays an expired fixation (DR-100)", () => {
  it("C-19: fixation ended before baseDate, no successor block", () => {
    const l: RefLoan = {
      start: "2018-03-15",
      principal: "3000000",
      ratePa: "0.02",
      instalment: "12000",
      fixationMonths: 60,
    };
    const { e, r } = both(l);
    // The reset applies from the payment due 2023-04-15, not from grid month 1
    // (the engine opened at 2,255,470.08 with a 14,816.90 instalment before D-30).
    expect(Math.abs(opening(e) - 2326745.42)).toBeLessThanOrEqual(CENT);
    expect(Math.abs(refOpening(r) - 2326745.42)).toBeLessThanOrEqual(CENT);
    expect(e[0].instalment.toFixed(2)).toBe("15285.13");
    expect(maxDev(e, r)).toBeLessThanOrEqual(TIGHT);
  });

  it("expired fixation on a month-end start (baseDate 28 Feb)", () => {
    const l: RefLoan = {
      start: "2019-01-31",
      principal: "2500000",
      ratePa: "0.025",
      instalment: "11000",
      fixationMonths: 36,
    };
    const { e, r } = both(l, "2026-02-28");
    expect(Math.abs(opening(e) - refOpening(r))).toBeLessThanOrEqual(TIGHT);
    expect(maxDev(e, r)).toBeLessThanOrEqual(TIGHT);
  });

  // DR-117 (ADR 0079): a scenario rate shock applies only to payments due after
  // baseDate. The window stays anchored at fixation end (D-28); history is not repriced.
  const shockedLoan: RefLoan = {
    start: "2021-06-20",
    principal: "4000000",
    ratePa: "0.019",
    instalment: "16000",
    fixationMonths: 48,
  };
  const shock = (deltaPa: string) =>
    [
      { rateShock: { deltaPa, months: 24, anchor: "fixationEnd" as const } },
      { rateShock: { deltaPa: rate(deltaPa), durationYears: 2 } },
    ] as const;

  it("scenario rate shock whose window started before baseDate: engine = reference // DR-117", () => {
    // Fixation ended 2025-06-20; the window (fixation end + 2 y) runs to 2027-06-20.
    const { e, r } = both(shockedLoan, "2026-06-07", ...shock("0.02"));
    expect(maxDev(e, r)).toBeLessThanOrEqual(TIGHT);
  });

  it("the shock leaves the opening balance of a loan past fixation unchanged // DR-117", () => {
    const plain = both(shockedLoan, "2026-06-07").e;
    const { e } = both(shockedLoan, "2026-06-07", ...shock("0.02"));
    expect(opening(e)).toBe(opening(plain));
  });

  it("the shock still prices the window months after baseDate, then reverts // DR-117", () => {
    const { e, r } = both(shockedLoan, "2026-06-07", ...shock("0.02"));
    const reset = A0.postFixationResetRatePa;
    // Grid month 1 carries the 2026-06-20 payment; the window ends 2027-06-20 (m13).
    expect(e[0].ratePa.toString()).toBe(reset.plus("0.02").toString());
    expect(e[12].ratePa.toString()).toBe(reset.plus("0.02").toString());
    expect(e[13].ratePa.toString()).toBe(reset.toString());
    expect(r[0].ratePa.toString()).toBe(e[0].ratePa.toString());
  });
});

describe("fixed by D-24/D-31: dev-loan instalment from the term, held between events (DR-102)", () => {
  // C-11: the entered 9,000 is not the annuity of 2 M at 3 % over 360 months. Under
  // D-31 the instalment is derived from the term (8,432.08) and, under D-24, it holds
  // until a real event (the tranche in grid month 3, then the fixation reset).
  const l: RefLoan = {
    start: "2021-09-07",
    principal: "2000000",
    ratePa: "0.03",
    instalment: "9000",
    fixationMonths: 60,
    termMonths: 360,
    draws: [{ date: "2026-09-07", amount: "200000" }],
  };

  it("C-11: the engine agrees with the reference on every month", () => {
    const { e, r } = both(l);
    expect(maxDev(e, r)).toBeLessThanOrEqual(TIGHT);
    expect(e[0].instalment.toFixed(2)).toBe("8432.08"); // PMT(2M, 3 %, 360)
  });

  it("C-11: the instalment holds exactly until the tranche lands", () => {
    const { e } = both(l);
    expect(e[1].instalment.equals(e[0].instalment)).toBe(true);
    expect(e[2].instalment.equals(e[1].instalment)).toBe(false); // tranche month
  });
});

describe("fixed by D-41: a tranche between the last payment and baseDate (DR-016)", () => {
  const dev: RefLoan = {
    start: "2026-05-20",
    principal: "1000000",
    ratePa: "0.05",
    instalment: "5000",
    fixationMonths: 60,
    termMonths: 360,
    draws: [{ date: "2026-06-01", amount: "500000" }],
  };
  const cases: [string, RefLoan][] = [
    ["C-10: no payment due yet (started < 1 month before baseDate)", dev],
    [
      "payments already due; tranche after the last one",
      { ...dev, start: "2026-01-20" },
    ],
    ["interest-only until completion", { ...dev, completion: "2027-01-31" }],
    [
      "tranche on the last due date stays in the catch-up",
      {
        ...dev,
        start: "2026-01-20",
        draws: [{ date: "2026-05-20", amount: "500000" }],
      },
    ],
  ];
  it.each(cases)("%s: engine = reference", (_, l) => {
    const { e, r } = both(l);
    expect(maxDev(e, r)).toBeLessThanOrEqual(TIGHT);
  });

  it("C-10: the baseDate debt includes the tranche, and Σ principal retires it", () => {
    const e = buildSchedule(toBlock(dev), A0);
    expect(
      Math.abs(balanceAtMonth(e, 0).toNumber() - 1500000),
    ).toBeLessThanOrEqual(CENT);
    const repaid = e.reduce((s, x) => s.plus(x.principal), D(0));
    expect(Math.abs(repaid.toNumber() - 1500000)).toBeLessThanOrEqual(TIGHT);
  });
});

describe("fixed by D-46: a tranche in a future loan's first-draw month (DR-122)", () => {
  // Start 20 Jun and a tranche on 1 Jul both land in grid month 1 (to 7 Jul).
  const dev: RefLoan = {
    start: "2026-06-20",
    principal: "1200000",
    ratePa: "0.04",
    instalment: "0",
    fixationMonths: 60,
    termMonths: 240,
    draws: [{ date: "2026-07-01", amount: "300000" }],
  };
  const cases: [string, RefLoan][] = [
    ["tranche in the draw month", dev],
    [
      "two tranches in the draw month",
      {
        ...dev,
        draws: [
          { date: "2026-06-25", amount: "100000" },
          { date: "2026-07-01", amount: "300000" },
        ],
      },
    ],
    ["interest-only until completion", { ...dev, completion: "2027-06-30" }],
    [
      "control: a tranche one grid month later",
      { ...dev, draws: [{ date: "2026-07-20", amount: "300000" }] },
    ],
  ];
  it.each(cases)("%s: engine = reference", (_, l) => {
    const { e, r } = both(l);
    expect(maxDev(e, r)).toBeLessThanOrEqual(TIGHT);
  });

  it("the draw row holds the tranche, and Σ principal retires it", () => {
    const e = buildSchedule(toBlock(dev), A0);
    expect(Math.abs(e[0].endBalance.toNumber() - 1500000)).toBeLessThanOrEqual(
      CENT,
    );
    const repaid = e.reduce((s, x) => s.plus(x.principal), D(0));
    expect(Math.abs(repaid.toNumber() - 1500000)).toBeLessThanOrEqual(TIGHT);
  });
});

describe("fixed by D-27/D-47: a successor after baseDate replaces its predecessor (DR-030)", () => {
  const refi = (start: string, extra: Partial<RefLoan> = {}): RefLoan => ({
    start,
    principal: "1633000",
    ratePa: "0.039",
    instalment: "9800",
    fixationMonths: 60,
    ...extra,
  });
  /** Engine chain (`propertySchedule`) and the reference chain for one property. */
  function chainBoth(loans: RefLoan[]) {
    const blocks = loans.map((l, i) => toBlock(l, `b${i}`));
    const e = propertySchedule(blocks, A0);
    const r = referenceChain(loans, {
      baseDate: "2026-06-07",
      months: e.rows.length,
      resetRatePa: RESET,
      devInstalment: "fromTerm",
      openingDraws: "nextPeriod",
    });
    return { e, r };
  }
  const P = SEED_LOANS.javorova;
  const dev: RefLoan = {
    start: "2026-03-01",
    principal: "1000000",
    ratePa: "0.045",
    instalment: "0",
    fixationMonths: 60,
    termMonths: 360,
    draws: [
      { date: "2026-11-15", amount: "500000" },
      { date: "2027-06-15", amount: "300000" }, // after the refi: dropped
    ],
    completion: "2027-03-31",
  };
  const cases: [string, RefLoan[]][] = [
    ["refix on the fixation end (payment kept)", [P, refi("2031-01-17")]],
    [
      "refinance before the payment day (payment dropped)",
      [P, refi("2031-01-10")],
    ],
    [
      "successor in grid month 1",
      [P, refi("2026-06-20", { principal: "1940000" })],
    ],
    [
      "successor after the predecessor is paid off",
      [
        {
          start: "2025-06-15",
          principal: "120000",
          ratePa: "0.03",
          instalment: "5000",
          fixationMonths: 60,
        },
        refi("2028-03-15"),
      ],
    ],
    [
      "future loan followed by a successor",
      [refi("2027-03-15"), refi("2032-03-15", { principal: "1400000" })],
    ],
    [
      "two refinances",
      [
        P,
        refi("2031-01-17"),
        refi("2036-01-17", { principal: "1300000", ratePa: "0.05" }),
      ],
    ],
    [
      "development loan refinanced by a plain loan",
      [dev, refi("2027-05-01", { principal: "1480000" })],
    ],
    [
      "development loan with a tranche in the draw month after the refi start (DR-126)",
      [
        {
          ...dev,
          draws: [
            { date: "2026-11-15", amount: "500000" },
            { date: "2027-05-05", amount: "300000" }, // after the refi: dropped
          ],
        },
        refi("2027-05-01", { principal: "1480000" }),
      ],
    ],
  ];

  it.each(cases)("%s: engine = reference", (_, loans) => {
    const { e, r } = chainBoth(loans);
    expect(maxDev(e.rows, r.rows)).toBeLessThanOrEqual(TIGHT);
    expect(e.refinances).toHaveLength(r.handovers.length);
    e.refinances.forEach((x, i) => {
      const h = r.handovers[i];
      expect(x.month).toBe(h.month);
      expect(
        Math.abs(x.paidOff.minus(h.paidOff.toString()).toNumber()),
      ).toBeLessThanOrEqual(TIGHT);
      expect(
        Math.abs(x.drawn.minus(h.drawn.toString()).toNumber()),
      ).toBeLessThanOrEqual(TIGHT);
    });
  });

  it.each(cases)(
    "%s: Σ principal = first debt + Σ(drawn − paid off)",
    (_, loans) => {
      const { e } = chainBoth(loans);
      const [first, second] = loans;
      const base = "2026-06-07";
      // First debt: the opening balance of a running loan (or a future loan's principal)
      // plus its tranches after baseDate and on/before the first successor's start.
      const firstDebt = (
        first.start > base
          ? D(String(first.principal))
          : D(String(opening(buildSchedule(toBlock(first), A0))))
      ).plus(
        (first.draws ?? [])
          .filter((x) => x.date > base && x.date <= second.start)
          .reduce((sum, x) => sum.plus(String(x.amount)), D(0)),
      );
      const expected = e.refinances.reduce(
        (sum, x) => sum.plus(x.drawn).minus(x.paidOff),
        firstDebt,
      );
      const repaid = e.rows.reduce((sum, x) => sum.plus(x.principal), D(0));
      expect(Math.abs(repaid.minus(expected).toNumber())).toBeLessThanOrEqual(
        TIGHT,
      );
      expect(e.rows.at(-1)?.endBalance.toNumber()).toBe(0);
    },
  );

  it("the seed refix: rate 0.039 from month 57, the 17 Jan payment kept in month 56", () => {
    const withRefi = schedulesByProperty(
      [...P0.mortgages, toBlock(refi("2031-01-17"), "m-refi", "javorova")],
      P0.properties.map((p) => p.id),
      A0,
    ).get("javorova")!;
    expect(withRefi[55].ratePa.toString()).toBe("0.0169");
    expect(withRefi[55].principal.toFixed(1)).toBe("4762.8");
    expect(withRefi[55].endBalance.toString()).toBe("1633000");
    expect(withRefi[56].ratePa.toString()).toBe("0.039");
    expect(withRefi[56].instalment.toString()).toBe("9800");
  });

  it("snapshot and projection after the handover follow the successor", () => {
    const P1 = {
      ...P0,
      mortgages: [
        ...P0.mortgages,
        toBlock(refi("2031-01-17"), "m-refi", "javorova"),
      ],
    };
    const ids = P1.properties.map((p) => p.id);
    const schedules = schedulesByProperty(P1.mortgages, ids, A0);
    const rows = schedules.get("javorova")!;
    const s = portfolioSnapshot(P1, A0, isoDate("2032-06-07"), schedules);
    const petr = s.perProperty.find((x) => x.propertyId === "javorova")!;
    expect(petr.debt.equals(balanceAtMonth(rows, 72))).toBe(true);
    expect(petr.annualDebtService.toString()).toBe("117600"); // 12 × 9,800
    const year6 = portfolioProjection(P1, A0)[6];
    const seed6 = portfolioProjection(P0, A0)[6];
    expect(year6.balance.equals(seed6.balance)).toBe(false);
  });
});

describe("deviations (engine asserted as today; reference = Czech-practice truth)", () => {
  it("J-06: re-amortizing the month after a draw costs +1,300.21 Kč interest (reference)", () => {
    const l: RefLoan = {
      start: "2025-10-01",
      principal: "1000000",
      ratePa: "0.05",
      instalment: "5000",
      fixationMonths: 60,
      termMonths: 360,
      draws: [
        { date: "2026-03-01", amount: "500000" },
        { date: "2026-11-15", amount: "800000" },
        { date: "2027-06-15", amount: "300000" },
      ],
      completion: "2027-03-31",
    };
    const sum = (rows: RefRow[]) =>
      rows.reduce((s, x) => s.plus(x.interest.toString()), D(0));
    const opts = { baseDate: "2026-06-07", months: 360, resetRatePa: RESET };
    const landing = referenceSchedule(l, opts);
    const next = referenceSchedule(l, { ...opts, drawTiming: "nextMonth" });
    expect(sum(next).minus(sum(landing)).toFixed(2)).toBe("1300.21");
  });

  // Under D-43 a later start is a successor, so a top-up replaces the main loan;
  // entry-point rejection and the fixation-end warning come in P5b/P7 (DR-103).
  it("C-12/J-14: a concurrent loan hides the other block's debt // DR-103", () => {
    const topUp: MortgageBlock = {
      id: "m-topup",
      propertyId: "javorova",
      startDate: isoDate("2024-06-01"),
      initialPrincipal: money("500000"),
      fixationYears: 5,
      interestRatePa: rate("0.05"),
      monthlyInstalment: money("5300"),
    };
    const P = { ...P0, mortgages: [...P0.mortgages, topUp] };
    const s = portfolioSnapshot(
      P,
      A0,
      A0.baseDate,
      schedulesByProperty(
        P.mortgages,
        P.properties.map((p) => p.id),
        A0,
      ),
    );
    const truth = referenceBalanceAt(
      SEED_LOANS.javorova,
      { resetRatePa: RESET },
      "2026-06-07",
    ).plus(
      referenceBalanceAt(
        {
          start: "2024-06-01",
          principal: "500000",
          ratePa: "0.05",
          instalment: "5300",
          fixationMonths: 60,
        },
        { resetRatePa: RESET },
        "2026-06-07",
      ),
    );
    expect(s.perProperty[0].debt.toFixed(2)).toBe("418985.29"); // DR-103 (D-43): top-up only
    expect(truth.toFixed(2)).toBe("2061892.60");
  });

  it("C-20: FV balance at an asOf past the reset ignores it; the app uses the schedule", () => {
    const b = P0.mortgages[0];
    const sch = buildSchedule(b, A0);
    // 2036-06-07 = grid month 120.
    expect(currentBalance(b, isoDate("2036-06-07")).toFixed(2)).toBe(
      "1067057.71",
    ); // legacy path only
    // useEngine path: equals the reference (payment-day reset) since D-21.
    expect(balanceAtMonth(sch, 120).toFixed(2)).toBe("1134841.71");
    expect(
      referenceBalanceAt(
        SEED_LOANS.javorova,
        { resetRatePa: RESET },
        "2036-06-07",
      ).toFixed(2),
    ).toBe("1134841.71");
  });

  it("C-21: payoff-year debt service — snapshot 12 × instalment vs projection actual payments", () => {
    const b = P0.mortgages.find((m) => m.propertyId === "lipova")!;
    const sch = buildSchedule(b, A0);
    // Year 26 = grid months 301–312; the loan pays off in month 306.
    const actual = sch
      .slice(300, 312)
      .reduce((s, x) => s.plus(x.interest).plus(x.principal), D(0));
    expect(actual.toFixed(2)).toBe("167416.87"); // D-21: −45.06 (was 167,461.93)
    const s = portfolioSnapshot(
      P0,
      A0,
      isoDate("2051-06-07"),
      schedulesByProperty(
        P0.mortgages,
        P0.properties.map((p) => p.id),
        A0,
      ),
    );
    const walt = s.perProperty.find((p) => p.propertyId === "lipova")!;
    expect(walt.annualDebtService.toFixed(2)).toBe("334833.73"); // documented rule (spec §4.5); D-21: 12 × the refix instalment 27,902.81 (was 334,923.85)
  });
});

describe("fixed by D-40: the payment at maturity clears the balance (DR-104)", () => {
  it("no post-payoff dust row after the final payment", () => {
    const l: RefLoan = {
      start: "2024-01-10",
      principal: "3000000",
      ratePa: "0.12",
      instalment: "40000",
      fixationMonths: 60,
    };
    const { e, r } = both(l);
    const i = 112; // grid month 113 (it showed a 31,640.12 instalment on ~0 before)
    expect(e[i - 1].endBalance.isZero()).toBe(true);
    expect(e[i].instalment.isZero()).toBe(true);
    expect(r[i].payment.isZero()).toBe(true);
    expect(maxDev(e, r)).toBeLessThanOrEqual(TIGHT);
  });

  it("explicit term with an instalment too small to retire the loan: balloon at maturity", () => {
    // 240 payments of 15,000 leave a residual; PMT(5 %, 240) would be 19,798.68.
    const l: RefLoan = {
      start: "2024-01-10",
      principal: "3000000",
      ratePa: "0.05",
      instalment: "15000",
      fixationMonths: 360,
      termMonths: 240,
    };
    const { e, r } = both(l);
    // Payment #240 is due 2044-01-10: grid month 212 (2044-02-07) carries it.
    const last = e[211];
    expect(last.endBalance.isZero()).toBe(true);
    expect(last.principal.greaterThan(last.instalment)).toBe(true); // the balloon
    expect(e[212].instalment.isZero()).toBe(true);
    expect(maxDev(e, r)).toBeLessThanOrEqual(TIGHT);
  });
});
