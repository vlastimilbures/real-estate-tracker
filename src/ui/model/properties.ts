// The Properties list's totals row and band legend (ADR 0205). The totals are the
// Dashboard's portfolio tiles at the page's as-of basis in nominal Kč, so the row equals
// the Dashboard at Today with the "All" filter; nothing is summed here.
import type {
  Assumptions,
  PortfolioSnapshot,
  ProjectionYear,
  Property,
} from "../../engine";
import type { Dictionary } from "../../i18n";
import type { Decimal } from "../../lib/money";
import { tilesForAsOf, type AsOfBasis } from "./dashboard";
import type { Band } from "./health";
import { projectionSeries } from "./projection";

export interface PropertiesTotal {
  label: string;
  value: Decimal;
  debt: Decimal;
  undrawnDebt: Decimal;
  equity: Decimal;
  noi: Decimal;
  netCashFlow: Decimal;
  ltv: Decimal | null;
  dscr: Decimal | null;
}

/** The totals row, or null when the list has fewer than two properties. An inactive
 *  property is listed but not in the portfolio, so the label says the total is of the
 *  active ones. */
export function propertiesTotal(
  snapshot: PortfolioSnapshot,
  projection: ProjectionYear[],
  basis: AsOfBasis,
  assumptions: Assumptions,
  properties: readonly Property[],
  t: Pick<Dictionary, "properties">,
): PropertiesTotal | null {
  if (properties.length < 2) return null;
  const s = tilesForAsOf(
    snapshot,
    projectionSeries(projection, "nominal", assumptions),
    basis,
    "nominal",
    assumptions,
  );
  return {
    label: properties.some((p) => p.active === false)
      ? t.properties.totalRowActive
      : t.properties.totalRow,
    value: s.totalReportedValue,
    debt: s.totalDebt,
    undrawnDebt: s.totalUndrawnDebt,
    equity: s.totalEquity,
    noi: s.noi,
    netCashFlow: s.netCashFlow,
    ltv: s.ltv,
    dscr: s.dscr,
  };
}

/** The legend under the table: each metric's markers with the words its cells use. */
export function bandLegend(
  t: Pick<Dictionary, "dashboard" | "properties">,
): { label: string; items: { bands: Band[]; word: string }[] }[] {
  const d = t.dashboard;
  return [
    {
      label: t.properties.colLtv,
      items: [
        { bands: ["good"], word: d.badgeConservative },
        { bands: ["warn"], word: d.badgeModerate },
        { bands: ["bad"], word: d.badgeHigh },
      ],
    },
    {
      label: t.properties.colDscr,
      items: [
        { bands: ["good", "warn"], word: d.badgeCoversDebt },
        { bands: ["bad"], word: d.badgeShortfall },
      ],
    },
  ];
}
