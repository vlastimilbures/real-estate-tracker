// One-pass engine runs for the UI's recompute paths (P9, DR-042). The separate public
// calls each rebuild every loan schedule (and the KPIs rebuild the projection); these
// build the schedules once and share them. The results are exactly those of the
// separate calls, made in the same order, so the same error is thrown first.
import { assertInputs } from "./validate";
import { propertySchedules, scheduleRows } from "./schedule";
import { portfolioSnapshot } from "./metrics";
import { projectPortfolio } from "./projections";
import { kpisFrom } from "./kpis";
import type {
  AmortizationRow,
  Assumptions,
  IsoDate,
  Portfolio,
  PortfolioKPIs,
  PortfolioSnapshot,
  ProjectionYear,
} from "./types";

export interface PortfolioOutputs {
  /** Each property's amortization rows, keyed by propertyId. */
  schedules: Map<string, AmortizationRow[]>;
  snapshot: PortfolioSnapshot;
  projection: ProjectionYear[];
  kpis: PortfolioKPIs;
}

/**
 * Schedules, snapshot at `asOf`, projection and KPIs in one pass: equal to
 * `schedulesByProperty` → `portfolioSnapshot` → `portfolioProjection` → `portfolioKpis`.
 */
export function portfolioOutputs(
  portfolio: Portfolio,
  assumptions: Assumptions,
  asOf: IsoDate = assumptions.baseDate,
): PortfolioOutputs {
  const built = propertySchedules(
    portfolio.mortgages,
    portfolio.properties.map((p) => p.id),
    assumptions,
  );
  const schedules = scheduleRows(built);
  const snapshot = portfolioSnapshot(portfolio, assumptions, asOf, schedules); // D-37
  const projection = projectPortfolio(portfolio, assumptions, schedules);
  return {
    schedules,
    snapshot,
    projection,
    kpis: kpisFrom(portfolio, assumptions, projection, built),
  };
}

/** `portfolioProjection` and `portfolioKpis` in one pass (one scenario of a compare). */
export function projectionAndKpis(
  portfolio: Portfolio,
  assumptions: Assumptions,
): { projection: ProjectionYear[]; kpis: PortfolioKPIs } {
  assertInputs(portfolio, assumptions); // D-37
  const built = propertySchedules(
    portfolio.mortgages,
    portfolio.properties.map((p) => p.id),
    assumptions,
  );
  const projection = projectPortfolio(
    portfolio,
    assumptions,
    scheduleRows(built),
  );
  return {
    projection,
    kpis: kpisFrom(portfolio, assumptions, projection, built),
  };
}
