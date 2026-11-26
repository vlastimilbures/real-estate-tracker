// Table context lines (ADR 0111): the page subtitle names the currency, period and
// date of the table below it, so column headers stay unit-free.
import { fmtDate } from "../../lib/format";
import type { Dictionary } from "../../i18n";
import type { Mode } from "./lens";
import type { AsOfBasis } from "./dashboard";
import { edate } from "../../engine";
import {
  periodLabelLocalized,
  projectionColumns,
  showPeriodColumn,
  yearLabel,
  type SeriesRow,
} from "./projection";
import { exportFilename } from "../../lib/slug";
import type { TableExport } from "./xlsxExport";

/** Properties: count · as of {date} · amounts in Kč, flows per year. In a projection year
 *  the date names the year and its period, as Property detail labels it (ADR 0150). */
export function propertiesSubtitle(
  t: Dictionary,
  {
    count,
    asOf,
    basis,
    baseDate,
  }: { count: number; asOf: Date; basis: AsOfBasis; baseDate: Date },
): string {
  const date = fmtDate(asOf);
  return [
    t.properties.subtitle(count),
    basis.kind === "projection"
      ? t.properties.asOfProjection(
          date,
          yearLabel(t, basis.year, basis.calendarYear),
          periodLabelLocalized(
            baseDate,
            basis.year,
            t.monthsShort,
            t.projGrid.opening,
          ),
        )
      : t.properties.asOf(date),
    t.properties.unitsNote,
  ].join(" · ");
}

/** The lens in words; with `baseDate`, Real names the date its Kč are in (ADR 0159). */
export function lensLabel(
  t: Pick<Dictionary, "projections">,
  mode: Mode,
  baseDate?: Date,
): string {
  if (mode === "nominal") return t.projections.nominalKc;
  return baseDate
    ? t.projections.realTermsDated(fmtDate(baseDate))
    : t.projections.realTerms;
}

/** The lens as a lower-case word for running text ("real", "nominal"). */
export function lensWord(t: Pick<Dictionary, "common">, mode: Mode): string {
  return mode === "real" ? t.common.realLower : t.common.nominalLower;
}

/** Projections: the money terms (Real names the base date) and the period of each column. */
export function projectionsSubtitle(
  t: Dictionary,
  mode: Mode,
  baseDate: Date,
): string {
  return [
    t.projections.subtitle(lensLabel(t, mode, baseDate)),
    t.projections.periodNote,
  ].join(" · ");
}

/** The months a projection year runs from and to, when they are not calendar years
 *  (ADR 0211 §2). */
export function yearSpanNote(
  t: Pick<Dictionary, "monthsShort" | "projections">,
  baseDate: Date,
): string | null {
  if (!showPeriodColumn(baseDate)) return null;
  const month = (n: number) =>
    t.monthsShort[edate(baseDate, n).getUTCMonth()] ?? "";
  return t.projections.yearSpan(month(1), month(12));
}

const withSpan = (t: Dictionary, line: string, baseDate: Date): string =>
  [line, yearSpanNote(t, baseDate)].filter(Boolean).join(" · ");

/** The Projections page subtitle: the context line, then the years' span (ADR 0211). The
 *  export keeps `projectionsSubtitle`: its Period column states the span. */
export function projectionsPageSubtitle(
  t: Dictionary,
  mode: Mode,
  baseDate: Date,
): string {
  return withSpan(t, projectionsSubtitle(t, mode, baseDate), baseDate);
}

/** Property detail's projection panel hint: the lens, then the years' span (ADR 0211). */
export function projectionPanelHint(
  t: Dictionary,
  lens: string,
  baseDate: Date,
): string {
  return withSpan(t, lens, baseDate);
}

/** The note lines of a projection export: whose table it is, then the screen's context
 *  line, so the file still says its lens and period once it leaves the app (ADR 0159);
 *  without the years' span, which the file's Period column states (ADR 0211 §5). */
export function projectionExportNotes(
  t: Dictionary,
  entityName: string,
  mode: Mode,
  baseDate: Date,
): string[] {
  return [entityName, projectionsSubtitle(t, mode, baseDate)];
}

/** A projection's export (ADR 0159): the file names the entity by its full name, under
 *  the lens; Projections' portfolio is the entity `{ name: Portfolio, id: "portfolio" }`. */
export function projectionExport(
  t: Dictionary,
  entity: { name: string; id: string },
  rows: SeriesRow[],
  mode: Mode,
  baseDate: Date,
): TableExport<SeriesRow> {
  return {
    filename: exportFilename(entity.name, entity.id, "projection", mode),
    sheetName: t.xlsx.sheetNames.projection,
    columns: (shown: SeriesRow[]) => projectionColumns(t, baseDate, shown),
    rows,
    notes: projectionExportNotes(t, entity.name, mode, baseDate),
  };
}
