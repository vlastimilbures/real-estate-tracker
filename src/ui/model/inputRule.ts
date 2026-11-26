// The text of an engine input rule (`t.inputRules`). A rule that names a limit the code
// defines takes it as an argument, so every caller reads the text here. Pure.
import type { ValidationCode } from "../../engine";
import type { Dictionary } from "../../i18n";
import { fmtNumber } from "../../lib/format";
import { INT_RANGES } from "../../lib/rules";

export function inputRuleText(
  t: Pick<Dictionary, "inputRules">,
  code: ValidationCode,
): string {
  if (code === "INVALID_RECAST_MATURITY") {
    // The recast cap is the longest loan term the forms accept (MAX_LOAN_TERM_MONTHS).
    const years = INT_RANGES.loanTermYears.max;
    return t.inputRules.INVALID_RECAST_MATURITY(fmtNumber(years), years);
  }
  return t.inputRules[code];
}
