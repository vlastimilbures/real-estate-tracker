// Table context lines (ADR 0111, #21): the page subtitle names the currency, period and
// date of the table below it, so column headers stay unit-free.
import { fmtDate } from "../../lib/format";
import type { Dictionary } from "../../i18n";
import type { Mode } from "./lens";

/** Properties: count · as of {date} · amounts in Kč, flows per year. */
export function propertiesSubtitle(
  t: Dictionary,
  count: number,
  asOf: Date,
): string {
  return [
    t.properties.subtitle(count),
    t.properties.asOf(fmtDate(asOf)),
    t.properties.unitsNote,
  ].join(" · ");
}

/** Projections: the money terms (Real names the base date) and the period of each column. */
export function projectionsSubtitle(
  t: Dictionary,
  mode: Mode,
  baseDate: Date,
): string {
  const lens =
    mode === "real"
      ? t.projections.realTermsDated(fmtDate(baseDate))
      : t.projections.nominalKc;
  return [t.projections.subtitle(lens), t.projections.periodNote].join(" · ");
}
