// The series of the projection charts, shared by the Dashboard and Property detail.
// Pure: names, colours and dashes only; the rows carry the lens.
import type { Dictionary } from "../../i18n";
import type { Mode } from "./lens";
import {
  COMMITTED_DASH,
  SERIES,
  hasPurchases,
  hasUndrawn,
  type ChartRow,
  type EquityChangeRow,
} from "./chartData";

/** The value chart's line names: each page names them from its own namespace. */
interface ValueSeriesNames {
  value: string;
  debt: string;
  committedDebt: string;
  equity: string;
}

/** Value, debt, committed debt (dashed while a development loan has tranches ahead,
 *  ADR 0169) and equity. */
export function valueSeries(names: ValueSeriesNames, rows: ChartRow[]) {
  return [
    { key: "value", name: names.value, color: SERIES.petrol },
    { key: "balance", name: names.debt, color: SERIES.clay },
    ...(hasUndrawn(rows)
      ? [
          {
            key: "committedDebt",
            name: names.committedDebt,
            color: SERIES.clay,
            dash: COMMITTED_DASH,
          },
        ]
      : []),
    { key: "equity", name: names.equity, color: SERIES.brass },
  ];
}

/** The fixation-end markers' tooltip heading: the debt at reset stays nominal in the real
 *  lens (ADR 0210). */
export function resetMarkerHeading(t: Dictionary, mode: Mode): string {
  return mode === "real" ? t.charts.rateResetNominal : t.charts.rateReset;
}

/** The Dashboard's six projection charts' series. */
export function dashboardSeries(
  t: Dictionary,
  rows: ChartRow[],
  eqChange: EquityChangeRow[],
) {
  const d = t.dashboard;
  return {
    valueSeries: valueSeries(
      {
        value: d.seriesValue,
        debt: d.seriesDebt,
        committedDebt: d.seriesCommittedDebt,
        equity: d.seriesEquity,
      },
      rows,
    ),
    equitySeries: [
      { key: "appreciation", name: d.seriesAppreciation, color: SERIES.petrol },
      // ADR 0165: only when a purchase falls inside the projection.
      ...(hasPurchases(eqChange)
        ? [{ key: "purchases", name: d.seriesPurchases, color: SERIES.slate }]
        : []),
      { key: "paydown", name: d.seriesDebtPaydown, color: SERIES.brass },
      { key: "drawdown", name: d.seriesDebtDrawn, color: SERIES.clay },
    ],
    cashFlowSeries: [
      { key: "netCashFlow", name: d.seriesNetCashFlow, color: SERIES.positive },
    ],
    rentSeries: [
      { key: "grossRent", name: d.seriesGross, color: SERIES.slate },
      { key: "effectiveRent", name: d.seriesEffective, color: SERIES.petrol },
    ],
    noiSeries: [
      { key: "noi", name: d.seriesNoi, color: SERIES.petrol },
      { key: "debtService", name: d.seriesDebtService, color: SERIES.clay },
    ],
    ltvSeries: [{ key: "ltv", name: d.seriesLtv, color: SERIES.slate }],
  };
}
