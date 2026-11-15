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
import { ownedOn, tilesForAsOf, type AsOfBasis } from "./dashboard";
import { dscrBand, ltvBand, type Band } from "./health";
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

/** The totals row, or null when fewer than two properties are active (an inactive one is
 *  listed but not in the portfolio, so there is nothing to total). The label says what
 *  is counted: a pending purchase's value and flows are not owned yet (its drawn debt
 *  is, ADR 0165), and an inactive property is left out (ADR 0205 §5). */
export function propertiesTotal(
  snapshot: PortfolioSnapshot,
  projection: ProjectionYear[],
  basis: AsOfBasis,
  assumptions: Assumptions,
  properties: readonly Property[],
  t: Pick<Dictionary, "properties">,
): PropertiesTotal | null {
  const active = properties.filter((p) => p.active !== false);
  if (active.length < 2) return null;
  const pending = active.some(
    (p) => !ownedOn(p.purchaseDate, basis, assumptions.baseDate, snapshot.asOf),
  );
  const s = tilesForAsOf(
    snapshot,
    projectionSeries(projection, "nominal", assumptions),
    basis,
    "nominal",
    assumptions,
  );
  return {
    label: pending
      ? t.properties.totalRowOwned
      : active.length < properties.length
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

/** Whether any row shows a health marker, so the legend has something to explain: an
 *  owned row whose LTV or DSCR has a band (ADR 0205 §2). */
export function hasMarkers(
  rows: readonly {
    owned: boolean;
    ltv: Decimal | null;
    dscr: Decimal | null;
  }[],
): boolean {
  return rows.some(
    (r) =>
      r.owned &&
      (ltvBand(r.ltv) !== "neutral" || dscrBand(r.dscr) !== "neutral"),
  );
}
