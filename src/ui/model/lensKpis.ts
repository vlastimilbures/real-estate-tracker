// The KPIs that have a nominal and a real value, picked for the lens in one place
// (ADR 0087): a KPI shown under the Real toggle must never be the nominal figure.
import type { Decimal } from "../../lib/money";
import type { PortfolioKPIs } from "../../engine";
import type { LeveredIrr } from "./irr";
import type { Mode } from "./lens";

export interface LensKpis {
  netWorth: Decimal;
  netWorthMultiple: Decimal | null; // null with no growth base (ADR 0126)
  cagr: PortfolioKPIs["cagrNominal"];
  cumulativeNetCashFlow: Decimal; // cash to owner (ADR 0161)
  totalInterest: Decimal;
  /** With the reason it has no value (UX-079, DR-158). */
  leveredIrr: LeveredIrr;
}

/** Every lensed KPI under `mode`. */
export function lensKpis(kpis: PortfolioKPIs, mode: Mode): LensKpis {
  return mode === "real"
    ? {
        netWorth: kpis.netWorthReal,
        netWorthMultiple: kpis.netWorthMultipleReal,
        cagr: kpis.cagrReal,
        cumulativeNetCashFlow: kpis.cumulativeNetCashFlowReal,
        totalInterest: kpis.totalInterestReal,
        leveredIrr: {
          rate: kpis.leveredIrrReal,
          reason: kpis.leveredIrrRealReason,
        },
      }
    : {
        netWorth: kpis.netWorthNominal,
        netWorthMultiple: kpis.netWorthMultiple,
        cagr: kpis.cagrNominal,
        cumulativeNetCashFlow: kpis.cumulativeNetCashFlow,
        totalInterest: kpis.totalInterest,
        leveredIrr: {
          rate: kpis.leveredIrrNominal,
          reason: kpis.leveredIrrNominalReason,
        },
      };
}
