// Pure model: whether a loaded portfolio has anything for the portfolio pages to show
// (ADR 0155, #127). Dashboard, Projections and Scenarios share this one definition, so
// "no property yet" and "every property deactivated" read the same on each page.
import type { Portfolio } from "../../engine";

export type PortfolioState =
  /** No property at all: the first-run empty state (ADR 0094). */
  | { kind: "empty" }
  /** At least one property, none active; `count` = how many are deactivated. */
  | { kind: "allInactive"; count: number }
  /** At least one active property (a pending purchase counts). */
  | { kind: "ready" };

export function portfolioState(portfolio: Portfolio): PortfolioState {
  const { properties } = portfolio;
  if (properties.length === 0) return { kind: "empty" };
  if (properties.every((p) => p.active === false))
    return { kind: "allInactive", count: properties.length };
  return { kind: "ready" };
}
