// The KPIs that have a nominal and a real value, picked for the lens (ADR 0087): the
// net-worth multiple and the cumulative net cash flow.
import type { Decimal } from "../../lib/money";
import type { PortfolioKPIs } from "../../engine";
import type { Mode } from "./lens";

export interface LensKpis {
  netWorthMultiple: Decimal | null; // null with no growth base (ADR 0126)
  cumulativeNetCashFlow: Decimal;
}

/** The net-worth multiple and cumulative net cash flow of the lens. */
export function lensKpis(kpis: PortfolioKPIs, mode: Mode): LensKpis {
  return mode === "real"
    ? {
        netWorthMultiple: kpis.netWorthMultipleReal,
        cumulativeNetCashFlow: kpis.cumulativeNetCashFlowReal,
      }
    : {
        netWorthMultiple: kpis.netWorthMultiple,
        cumulativeNetCashFlow: kpis.cumulativeNetCashFlow,
      };
}
