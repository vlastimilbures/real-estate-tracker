// D-17: the engine raises a typed EngineInputError for invalid loan inputs instead of
// producing NaN, Infinity or an endless loop (DR-014, DR-018, DR-043). One case per
// D-17 code, and every public path that computes a loan raises it.
import { describe, it, expect } from "vitest";
import { rate } from "../brands";
import { isoDate } from "../dates";
import { amortizationHealth, termMonths } from "../amortization";
import { buildSchedule, openingDebt, schedulesByProperty } from "../schedule";
import { portfolioSnapshot, propertySnapshot } from "../metrics";
import { portfolioProjection } from "../projections";
import { portfolioKpis } from "../kpis";
import { EngineInputError } from "../errors";
import type { ValidationCode } from "../validate";
import type { MortgageBlock, MortgageBlockFields, Portfolio } from "../types";
import { assumptions, portfolio } from "./support/seed";
import { devBlock } from "./support/mixed";
import { money } from "../brands";

const loan = (b: Partial<MortgageBlockFields>): MortgageBlock =>
  ({
    id: "m-x",
    propertyId: "javorova",
    startDate: isoDate("2021-01-17"),
    initialPrincipal: money("1912500"),
    fixationYears: 10,
    interestRatePa: rate("0.0169"),
    monthlyInstalment: money("6721.8"),
    ...b,
  }) as MortgageBlock;

const dev = (b: Partial<MortgageBlockFields>): MortgageBlock =>
  loan({ ...devBlock, id: "m-x", propertyId: "javorova", ...b });

/** The seed with Javorova's loan replaced by `block`. */
const withLoan = (block: MortgageBlock): Portfolio => ({
  ...portfolio,
  mortgages: portfolio.mortgages.map((m) =>
    m.propertyId === "javorova" ? block : m,
  ),
});

function caught(fn: () => unknown): EngineInputError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(EngineInputError);
    return e as EngineInputError;
  }
  throw new Error("expected an EngineInputError");
}

const CASES: [ValidationCode, string, MortgageBlock][] = [
  [
    "INSTALMENT_BELOW_INTEREST",
    "monthlyInstalment",
    loan({ monthlyInstalment: money("2550") }),
  ],
  [
    "ZERO_RATE_ZERO_INSTALMENT",
    "monthlyInstalment",
    loan({ interestRatePa: rate(0), monthlyInstalment: money(0) }),
  ],
  [
    "MISSING_TERM_FOR_DEV_LOAN",
    "loanTermYears",
    dev({ loanTermYears: undefined }),
  ],
  [
    "NEGATIVE_PRINCIPAL",
    "initialPrincipal",
    loan({ initialPrincipal: money(-1) }),
  ],
  [
    "NON_POSITIVE_DRAW",
    "draws",
    dev({ draws: [{ date: isoDate("2027-01-01"), amount: money(0) }] }),
  ],
  [
    "DRAW_BEFORE_START",
    "draws",
    dev({ draws: [{ date: isoDate("2020-01-01"), amount: money(1) }] }),
  ],
  // D-42 (DR-120): a draw dated on the start belongs in the initial principal.
  [
    "DRAW_BEFORE_START",
    "draws",
    dev({
      startDate: isoDate("2026-03-01"),
      draws: [{ date: isoDate("2026-03-01"), amount: money(1) }],
    }),
  ],
  // DR-074 (ADR 0079, ADR 0129 §3): a draw after the last-but-one payment date
  // (start + term − 1 month) is rejected, not repaid by the final payment in one shot.
  [
    "DRAW_AFTER_SCHEDULE_END",
    "draws",
    dev({
      startDate: isoDate("2026-03-01"),
      loanTermYears: 30,
      draws: [{ date: isoDate("2056-03-01"), amount: money(1) }],
    }),
  ],
  [
    "COMPLETION_BEFORE_START",
    "completionDate",
    dev({ completionDate: isoDate("2020-01-01") }),
  ],
  ["INVALID_TERM", "loanTermYears", loan({ loanTermYears: 0 })],
  ["INVALID_TERM", "fixationYears", loan({ fixationYears: -1 })],
  [
    "RATE_OUT_OF_RANGE",
    "interestRatePa",
    loan({ interestRatePa: rate("1.5") }),
  ],
];

describe("D-17: buildSchedule raises a typed error per invalid-loan code", () => {
  it.each(CASES)("%s (%s)", (code, field, block) => {
    const e = caught(() => buildSchedule(block, assumptions));
    expect(e.errors).toContainEqual({
      code,
      entity: "mortgage",
      id: "m-x",
      field,
    });
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("EngineInputError");
    expect(e.message).toContain(code);
  });

  it("lists every problem of the block", () => {
    const e = caught(() =>
      buildSchedule(
        loan({ initialPrincipal: money(-1), fixationYears: -1 }),
        assumptions,
      ),
    );
    expect(e.errors.map((x) => x.code)).toEqual([
      "NEGATIVE_PRINCIPAL",
      "INVALID_TERM",
    ]);
  });

  it("does not raise on the seed loans", () => {
    for (const b of portfolio.mortgages) {
      expect(() => buildSchedule(b, assumptions)).not.toThrow();
    }
  });
});

describe("D-17: every loan path raises the typed error", () => {
  const bad = loan({ monthlyInstalment: money("2550") }); // DR-014
  const p = withLoan(bad);
  const ids = p.properties.map((x) => x.id);
  const javorova = p.properties.find((x) => x.id === "javorova");

  it("projection, KPIs and schedules", () => {
    caught(() => schedulesByProperty(p.mortgages, ids, assumptions));
    caught(() => portfolioProjection(p, assumptions));
    caught(() => portfolioKpis(p, assumptions));
  });

  it("snapshot without schedules agrees", () => {
    caught(() => portfolioSnapshot(p, assumptions));
    if (!javorova) throw new Error("seed property missing");
    caught(() => propertySnapshot(javorova, p, assumptions));
  });

  it("termMonths and amortizationHealth: no NaN or Infinity term", () => {
    expect(caught(() => termMonths(bad)).errors[0]?.code).toBe(
      "INSTALMENT_BELOW_INTEREST",
    );
    const zero = loan({ interestRatePa: rate(0), monthlyInstalment: money(0) });
    expect(caught(() => amortizationHealth(zero)).errors[0]?.code).toBe(
      "ZERO_RATE_ZERO_INSTALMENT",
    );
  });

  it("0 % with a 0 instalment raises instead of looping (DR-018)", () => {
    const zero = withLoan(
      loan({ interestRatePa: rate(0), monthlyInstalment: money(0) }),
    );
    caught(() => portfolioProjection(zero, assumptions));
  });
});

describe("D-27 / D-43: two blocks of one property on the same start raise", () => {
  const seedBlock = portfolio.mortgages.find(
    (m) => m.propertyId === "javorova",
  );
  if (!seedBlock) throw new Error("seed block missing");
  const expected = {
    code: "DUPLICATE_BLOCK_START",
    entity: "mortgage",
    id: "m-x",
    field: "startDate",
  };
  const cases: [string, MortgageBlock[]][] = [
    [
      "in force at baseDate",
      [seedBlock, loan({ monthlyInstalment: money("9000") })],
    ],
    [
      "both after baseDate",
      [
        seedBlock,
        loan({ id: "m-y", startDate: isoDate("2031-01-17") }),
        loan({ startDate: isoDate("2031-01-17") }),
      ],
    ],
  ];

  it.each(cases)("%s: every loan path raises", (_, blocks) => {
    const p: Portfolio = {
      ...portfolio,
      mortgages: [
        ...portfolio.mortgages.filter((m) => m.propertyId !== "javorova"),
        ...blocks,
      ],
    };
    const ids = p.properties.map((x) => x.id);
    const javorova = p.properties.find((x) => x.id === "javorova");
    if (!javorova) throw new Error("seed property missing");
    for (const fn of [
      () => schedulesByProperty(p.mortgages, ids, assumptions),
      () => openingDebt(blocks, assumptions),
      () => portfolioProjection(p, assumptions),
      () => portfolioKpis(p, assumptions),
      () => portfolioSnapshot(p, assumptions),
      () => propertySnapshot(javorova, p, assumptions),
    ]) {
      expect(caught(fn).errors).toEqual([expected]);
    }
  });

  it("blocks with different starts do not raise", () => {
    const later = loan({ startDate: isoDate("2031-01-17") });
    expect(() => openingDebt([seedBlock, later], assumptions)).not.toThrow();
  });
});
