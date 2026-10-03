// P02 Part A.2 — the engine's month-by-month schedule against the independent
// reference model, for the three seed loans across 360 months and every column.
// Grid = EDATE(baseDate, m) rows with each payment's rate keyed on its due date
// EDATE(start, k) (J-03 a′, D-21 — the engine's calendar); no instalment rounding
// (J-01 a, ADR 0020).
import { describe, it, expect } from "vitest";
import { buildSchedule } from "../../schedule";
import { assumptions, portfolio } from "../support/seed";
import { referenceSchedule } from "./mortgageReference";
import { BASE, RESET, SEED_LOANS } from "./seedLoans";

const MONTHS = 360;
const MONEY_TOL = 1e-6; // Kč — far inside the ±1 Kč parity tolerance
const RATE_TOL = 0;

type Col = "ratePa" | "instalment" | "interest" | "principal" | "endBalance";
const COLS: Col[] = [
  "ratePa",
  "instalment",
  "interest",
  "principal",
  "endBalance",
];

function maxDeviation(propertyId: string): Record<Col, number> {
  const block = portfolio.mortgages.find((m) => m.propertyId === propertyId)!;
  const engine = buildSchedule(block, assumptions);
  const ref = referenceSchedule(SEED_LOANS[propertyId], {
    baseDate: BASE,
    months: MONTHS,
    resetRatePa: RESET,
    calendar: "gridDueDate",
  });
  const out = Object.fromEntries(COLS.map((c) => [c, 0])) as Record<
    Col,
    number
  >;
  for (let i = 0; i < MONTHS; i++) {
    const e = engine[i];
    const r = ref[i];
    expect(e.date.toISOString().slice(0, 10)).toBe(r.date);
    for (const c of COLS) {
      const dev = Math.abs(e[c].minus(r[c].toString()).toNumber());
      out[c] = Math.max(out[c], dev);
    }
  }
  return out;
}

describe("engine vs reference — seed loans, 360 months, all columns", () => {
  for (const id of Object.keys(SEED_LOANS)) {
    it(`${id}: max |Δ| within ${MONEY_TOL} Kč and exact rate`, () => {
      const dev = maxDeviation(id);
      expect(dev.ratePa).toBeLessThanOrEqual(RATE_TOL);
      expect(dev.instalment).toBeLessThanOrEqual(MONEY_TOL);
      expect(dev.interest).toBeLessThanOrEqual(MONEY_TOL);
      expect(dev.principal).toBeLessThanOrEqual(MONEY_TOL);
      expect(dev.endBalance).toBeLessThanOrEqual(MONEY_TOL);
    });
  }
});

describe("the payment at maturity clears the balance on the seed loans (D-40, DR-104)", () => {
  // Payment #term leaves exactly 0, so the month after it is a zero row (it used to
  // show the full instalment on a ~10⁻³³ Kč residual).
  const cases: [string, number][] = [
    ["javorova", 300],
    ["lipova", 306],
    ["dubova", 175],
  ];
  for (const [id, month] of cases) {
    it(`${id}: paid off in month ${month}, nothing due in month ${month + 1}`, () => {
      const block = portfolio.mortgages.find((m) => m.propertyId === id)!;
      const schedule = buildSchedule(block, assumptions);
      expect(schedule[month - 1].endBalance.isZero()).toBe(true);
      const next = schedule[month];
      expect(next.instalment.isZero()).toBe(true);
      expect(next.interest.isZero()).toBe(true);
      expect(next.principal.isZero()).toBe(true);
    });
  }
});
