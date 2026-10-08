// Table context lines (ADR 0111, #21): the page subtitle names the currency, period and
// date of the table below it, so column headers stay unit-free.
import { fmtDate } from "../../lib/format";
import type { Dictionary } from "../../i18n";
import type { Mode } from "./lens";
import type { AsOfBasis } from "./dashboard";
import { periodLabelLocalized, yearLabel } from "./projection";

/** Properties: count · as of {date} · amounts in Kč, flows per year. In a projection year
 *  the date names the year and its period, as Property detail labels it (ADR 0150). */
export function propertiesSubtitle(
  t: Dictionary,
  count: number,
  asOf: Date,
  basis: AsOfBasis,
  baseDate: Date,
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

/** The lens in words; with `baseDate`, Real names the date its Kč are in. */
export function lensLabel(t: Dictionary, mode: Mode, baseDate?: Date): string {
  if (mode === "nominal") return t.projections.nominalKc;
  return baseDate
    ? t.projections.realTermsDated(fmtDate(baseDate))
    : t.projections.realTerms;
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
