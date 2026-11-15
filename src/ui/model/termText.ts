// The remaining-term text of a loan (ADR 0117), shared by the property page's Loan
// outlook and the Dashboard's fixation timeline (ADR 0204).
import type { Dictionary } from "../../i18n";

/** Months as "24 yrs 8 months", "25 yrs" or "7 months" (ADR 0117). */
export function remainingTermText(
  months: number,
  d: Dictionary["propertyDetail"],
): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return d.monthsCount(rest);
  return rest === 0 ? d.yrs(years) : `${d.yrs(years)} ${d.monthsCount(rest)}`;
}
