// Translated text for one refused restore row. Pure; never shows the row's value,
// only the rule and, for OUT_OF_RANGE, the allowed range (ADR 0086).
import type { Dictionary } from "../../i18n";
import type { RestoreIssue } from "../../state/backup";
import { fmtInt, orDash } from "../../lib/format";
import { inputRuleText } from "./inputRule";

export function restoreIssueText(t: Dictionary, i: RestoreIssue): string {
  switch (i.rule) {
    case "UNREADABLE_VALUE":
      return t.backup.issueUnreadable;
    case "DUPLICATE_KEY":
      return t.backup.issueDuplicate;
    case "MISSING_ASSUMPTIONS":
      return t.backup.issueMissingAssumptions;
    case "OUT_OF_RANGE":
    case "BEYOND_LIMIT": {
      // A restore issue always carries its range; "—" guards a hand-built one.
      const n = (v: number | undefined) => orDash(v, fmtInt);
      // The size takes one decimal place, the other bounded fields whole numbers
      // (ADR 0236 §1), in the forms' range message (ADR 0259).
      const text =
        i.column === "size_m2" ? t.forms.sizeRange : t.forms.intRange;
      return text(n(i.range?.min), n(i.range?.max));
    }
    default:
      return inputRuleText(t, i.rule);
  }
}
