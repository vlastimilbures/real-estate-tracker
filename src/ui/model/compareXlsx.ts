// Scenario compare as an Excel workbook (ADR 0108): the Values-view key figures, then one
// sheet per chart series, all under the lens. Pure: the page hands the result to
// exportWorkbookXlsx. The cells come from the same rows the table and charts render.
import type { ProjectionYear } from "../../engine";
import type { Dictionary } from "../../i18n";
import type { Decimal } from "../../lib/money";
import type { Mode } from "./lens";
import { irrReasonText, leveredIrr } from "./irr";
import { tableValue } from "./chartData";
import {
  compareBase,
  compareFootnote,
  compareValueRows,
  mergeCompareMetric,
  type CompareResult,
  type CompareValueRow,
} from "./compare";
import {
  xlsxSheet,
  type CellKind,
  type XlsxColumn,
  type XlsxSheetCells,
} from "./xlsxExport";

type ChartRow = Record<string, number>;

/** The compare workbook: its file name and its four sheets. */
export function compareWorkbook(
  t: Dictionary,
  results: CompareResult[],
  mode: Mode,
): { filename: string; sheets: XlsxSheetCells[] } {
  const names = t.xlsx.sheetNames;
  const lens =
    mode === "real" ? t.projections.realTerms : t.projections.nominalKc;
  const chart = (
    name: string,
    kind: CellKind,
    pick: (y: ProjectionYear) => Decimal,
  ) =>
    xlsxSheet<ChartRow>({
      name,
      columns: [
        {
          header: t.projGrid.year,
          kind: "int",
          value: (y) => y.calendarYear ?? null,
        },
        ...results.map((r, i): XlsxColumn<ChartRow> => ({
          header: r.name,
          kind,
          value: (y) => tableValue(y[`s${i}`]),
        })),
      ],
      rows: mergeCompareMetric(results, mode, pick),
      notes: [lens],
    });

  return {
    filename: `scenario-compare-${mode}.xlsx`,
    sheets: [
      keyFiguresSheet(t, results, mode, lens),
      chart(names.compareNetWorth, "money", (y) => y.equity),
      chart(names.compareNetCashFlow, "money", (y) => y.netCashFlow),
      chart(names.compareLtv, "percent", (y) => y.ltv),
    ],
  };
}

/** Metric rows, one column per scenario; the lens, the rebased-returns footnote and each
 *  n/a IRR's reason follow as notes. */
function keyFiguresSheet(
  t: Dictionary,
  results: CompareResult[],
  mode: Mode,
  lens: string,
): XlsxSheetCells {
  const footnote = compareFootnote(t, results);
  const irrNotes = results.flatMap((r) => {
    const reason = irrReasonText(t, leveredIrr(r.kpis, mode).reason);
    return reason ? [`${r.name}: ${reason}`] : [];
  });
  return xlsxSheet<CompareValueRow>({
    name: t.xlsx.sheetNames.compareKeyFigures,
    columns: [
      { header: t.xlsx.metric, kind: "text", value: (row) => row.label },
      ...results.map((r): XlsxColumn<CompareValueRow> => ({
        header: r.name,
        kind: "text",
        kindOf: (row) => row.kind,
        value: (row) => row.value(r),
      })),
    ],
    rows: compareValueRows(t, mode, compareBase(results)),
    notes: [lens, ...(footnote ? [`* ${footnote}`] : []), ...irrNotes],
  });
}
