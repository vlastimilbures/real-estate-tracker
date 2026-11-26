// The one-pass engine run the app's recompute path uses. The separate public calls each
// rebuild every loan schedule (and the KPIs rebuild the projection); this builds the
// schedules once and shares them. The results are exactly those of the separate calls,
// and its steps run in the same order as before, so the same error is raised first. The
// projection + KPIs sequence (`runPortfolio`) lives in kpis.ts, shared with
// `projectionAndKpis`.
import {
  propertySchedules,
  scheduleRows,
  type PropertySchedule,
} from "./schedule";
import { snapshotPortfolio } from "./metrics";
import { assertAsOf, assertInputs } from "./validate";
import { runPortfolio } from "./kpis";
import { financingExposure, type FinancingExposure } from "./financing";
import type {
  AmortizationRow,
  Assumptions,
  IsoDate,
  Portfolio,
  PortfolioKPIs,
  PortfolioSnapshot,
  PortfolioYear,
} from "./types";

export interface PortfolioOutputs {
  /** Each property's amortization rows, keyed by propertyId. */
  schedules: Map<string, AmortizationRow[]>;
  snapshot: PortfolioSnapshot;
  projection: PortfolioYear[];
  kpis: PortfolioKPIs;
  /** Next fixations, modelled payoffs and fixation ends at `asOf` (ADR 0103). */
  financing: FinancingExposure;
}

/**
 * Schedules, snapshot at `asOf`, projection and KPIs in one pass: equal to
 * `propertySchedules` → `portfolioSnapshot` → `portfolioProjection` → `portfolioKpis`,
 * plus the financing exposure at `asOf` from the same schedules (ADR 0103). Pass
 * `schedules` (from `propertySchedules` on the same inputs) to reuse them.
 */
export function portfolioOutputs(
  portfolio: Portfolio,
  assumptions: Assumptions,
  asOf: IsoDate = assumptions.baseDate,
  schedules?: Map<string, PropertySchedule>,
): PortfolioOutputs {
  const built =
    schedules ??
    propertySchedules(
      portfolio.mortgages,
      portfolio.properties.map((p) => p.id),
      assumptions,
    );
  const rows = scheduleRows(built);
  // Validated after the schedules are built, as `portfolioSnapshot` on them would: the
  // order decides which error is raised first.
  const v = assertInputs(portfolio, assumptions); // ADR 0037
  assertAsOf(asOf, assumptions.baseDate); // ADR 0019
  const snapshot = snapshotPortfolio(v, asOf, rows);
  const { projection, kpis } = runPortfolio({ inputs: v, schedules: built });
  return {
    schedules: rows,
    snapshot,
    projection,
    kpis,
    financing: financingExposure(portfolio, assumptions, built, asOf),
  };
}
