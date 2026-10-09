// ADR 0165 (#126 (d)): a property bought after the as-of date whose loan is already drawn
// (an off-plan loan drawn at contract) owes that debt today. The portfolio totals count it
// in total debt (and so equity, LTV and the weighted rate) but not the value the owner
// does not own yet — conservative, like ADR 0124. Everything else stays owned-only.
import { describe, it, expect } from "vitest";
import { portfolioSnapshot } from "../metrics";
import { ZERO, type Decimal } from "../../lib/money";
import { assumptions } from "./support/seed";
import { mixed } from "./support/mixed";
import { mixedCashOutside } from "./support/synthetic";
import type { Portfolio, PropertySnapshot } from "../types";

const sum = (rows: PropertySnapshot[], sel: (s: PropertySnapshot) => Decimal) =>
  rows.reduce((acc, s) => acc.plus(sel(s)), ZERO);

const ownedActive = (s: PropertySnapshot) => s.owned && s.active;

describe("pending property's existing debt in portfolio totals (ADR 0165)", () => {
  const snap = portfolioSnapshot(mixedCashOutside, assumptions);
  const pending = snap.perProperty.find((s) => s.propertyId === "future")!;
  const owned = snap.perProperty.filter(ownedActive);

  it("the fixture's future buy is pending and already owes its loan", () => {
    expect(pending.owned).toBe(false);
    expect(pending.debt.greaterThan(ZERO)).toBe(true);
  });

  it("total debt adds the pending property's debt; equity and LTV follow", () => {
    const debt = sum(owned, (s) => s.debt).plus(pending.debt);
    expect(snap.totalDebt.equals(debt)).toBe(true);
    // ADR 0166: equity and LTV read the committed debt (the dev flat's undrawn
    // tranches too); a pending property commits only the debt it owes.
    expect(pending.committedDebt.equals(pending.debt)).toBe(true);
    const committed = sum(owned, (s) => s.committedDebt).plus(pending.debt);
    expect(snap.totalCommittedDebt.equals(committed)).toBe(true);
    expect(snap.totalEquity.equals(snap.totalValue.minus(committed))).toBe(
      true,
    );
    expect(snap.ltv?.equals(committed.div(snap.totalValue))).toBe(true);
  });

  it("the weighted rate weights the pending debt too", () => {
    const numerator = sum(owned, (s) => s.weightedRateNumerator).plus(
      pending.weightedRateNumerator,
    );
    expect(snap.weightedAvgRate.equals(numerator.div(snap.totalDebt))).toBe(
      true,
    );
  });

  it("value, income and debt service stay owned-only", () => {
    expect(snap.totalValue.equals(sum(owned, (s) => s.value))).toBe(true);
    expect(snap.noi.equals(sum(owned, (s) => s.noi))).toBe(true);
    expect(
      snap.annualDebtService.equals(sum(owned, (s) => s.annualDebtService)),
    ).toBe(true);
  });

  it("a pending property whose loan starts at purchase adds nothing", () => {
    const s = portfolioSnapshot(mixed, assumptions);
    const owedNow = s.perProperty.filter(ownedActive);
    expect(s.totalDebt.equals(sum(owedNow, (x) => x.debt))).toBe(true);
  });

  it("a deactivated pending property adds nothing", () => {
    const inactive: Portfolio = {
      ...mixedCashOutside,
      properties: mixedCashOutside.properties.map((p) =>
        p.id === "future" ? { ...p, active: false } : p,
      ),
    };
    const s = portfolioSnapshot(inactive, assumptions);
    expect(
      s.totalDebt.equals(sum(s.perProperty.filter(ownedActive), (x) => x.debt)),
    ).toBe(true);
  });
});
