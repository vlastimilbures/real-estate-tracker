// Snapshot-level zero-debt guard: once the schedule balance hits zero, the snapshot
// must report no instalment/rate (metrics.ts:180-181) — the sibling of the
// schedule-level phantom-instalment fix already tested at month 306. As-of tests
// otherwise stop at year 10, so no snapshot is ever taken after a loan retires
// (Javorova amortizes fully ~month 300 ≈ 2051).
import { describe, it, expect } from "vitest";
import { edate } from "../dates";
import { portfolioSnapshot } from "../metrics";
import { schedulesByProperty } from "../schedule";
import { assumptions, portfolio, BASE_DATE } from "./support/seed";

const schedules = schedulesByProperty(
  portfolio.mortgages,
  portfolio.properties.map((p) => p.id),
  assumptions,
);

describe("Snapshot past full payoff (Javorova, baseDate + 27y ≈ 2053)", () => {
  const asOf = edate(BASE_DATE, 27 * 12);
  const snap = portfolioSnapshot(portfolio, assumptions, asOf, schedules);
  const petr = snap.perProperty.find((p) => p.propertyId === "javorova")!;

  it("debt is fully repaid (0)", () => expect(petr.debt.isZero()).toBe(true));
  it("no phantom annual debt service", () =>
    expect(petr.annualDebtService.isZero()).toBe(true));
  it("DSCR is null when there is no debt service", () =>
    expect(petr.dscr).toBeNull());
});
