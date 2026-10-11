// The one-pass engine run for the UI's recompute path (P9, DR-042). The separate public
// calls each rebuild every loan schedule (and the KPIs rebuild the projection); this
// builds the schedules once and shares them. The results are exactly those of the
// separate calls, made in the same order, so the same error is thrown first. The
// projection + KPIs pass (`projectionAndKpis`) lives in kpis.ts, next to `portfolioKpis`,
// which reads it.
import { propertySchedules, scheduleRows } from "./schedule";
import { portfolioSnapshot } from "./metrics";
import { projectPortfolioParts } from "./projections";
import { kpisFrom } from "./kpis";
import { financingExposure, type FinancingExposure } from "./financing";
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
  /** Next fixations, modelled payoffs and fixation ends at `asOf` (ADR 0103). */
  financing: FinancingExposure;
}

/**
 * Schedules, snapshot at `asOf`, projection and KPIs in one pass: equal to
 * `propertySchedules` → `portfolioSnapshot` → `portfolioProjection` → `portfolioKpis`,
 * plus the financing exposure at `asOf` from the same schedules (ADR 0103).
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
  const { years: projection, prePurchase } = projectPortfolioParts(
    portfolio,
    assumptions,
    built,
  );
  return {
    schedules,
    snapshot,
    projection,
    kpis: kpisFrom(portfolio, assumptions, projection, built, prePurchase),
    financing: financingExposure(portfolio, assumptions, built, asOf),
  };
}
