// ADR 0165 (#126 (d)): a property bought after the as-of date whose loan is already drawn
// (an off-plan loan drawn at contract) owes that debt today. The portfolio totals count it
// in total debt (and so equity, LTV and the weighted rate) but not the value the owner
// does not own yet — conservative, like ADR 0124. Everything else stays owned-only.
import { describe, it, expect } from "vitest";
import { portfolioSnapshot } from "../metrics";
import { cpiAt, realPortfolioSnapshot } from "../real";
import { isoDate } from "../dates";
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

  // #299 item 2.
  it("an as-of date after the purchase counts the property as owned, nothing pending", () => {
    // Purchase 15.03.2028: on 07.06.2028 the flat is owned, so its debt is owned debt.
    const asOf = isoDate("2028-06-07");
    const later = portfolioSnapshot(mixedCashOutside, assumptions, asOf);
    const bought = later.perProperty.find((s) => s.propertyId === "future")!;
    expect(bought.owned).toBe(true);
    const ownedNow = later.perProperty.filter(ownedActive);
    expect(ownedNow).toContain(bought);
    expect(later.totalDebt.equals(sum(ownedNow, (s) => s.debt))).toBe(true);
    expect(
      later.totalCommittedDebt.equals(sum(ownedNow, (s) => s.committedDebt)),
    ).toBe(true);
  });

  it("the real lens deflates the pending debt with the rest", () => {
    const asOf = isoDate("2027-06-07");
    const nominal = portfolioSnapshot(mixedCashOutside, assumptions, asOf);
    const stillPending = nominal.perProperty.find(
      (s) => s.propertyId === "future",
    )!;
    expect(stillPending.owned).toBe(false);
    expect(stillPending.debt.greaterThan(ZERO)).toBe(true);
    const k = cpiAt(assumptions, asOf);
    expect(k.greaterThan(1)).toBe(true);
    const real = realPortfolioSnapshot(nominal, k);
    // Owned and pending rows in portfolio order, as the engine sums them.
    const owing = nominal.perProperty.filter((s) => s.active);
    expect(owing).toContain(stillPending);
    const debt = sum(owing, (s) => s.debt);
    expect(nominal.totalDebt.equals(debt)).toBe(true);
    expect(real.totalDebt.equals(debt.div(k))).toBe(true);
    // The pending debt is in the real total: it exceeds the owned debt alone by it
    // (up to Decimal rounding: the engine sums nominal rows, then divides).
    const ownedReal = sum(nominal.perProperty.filter(ownedActive), (s) =>
      s.debt.div(k),
    );
    expect(real.totalDebt.greaterThan(ownedReal)).toBe(true);
    expect(
      real.totalDebt
        .minus(ownedReal)
        .minus(stillPending.debt.div(k))
        .abs()
        .lessThan("1e-20"),
    ).toBe(true);
    expect(
      real.totalCommittedDebt.equals(nominal.totalCommittedDebt.div(k)),
    ).toBe(true);
    expect(real.totalEquity.equals(nominal.totalEquity.div(k))).toBe(true);
  });
});
