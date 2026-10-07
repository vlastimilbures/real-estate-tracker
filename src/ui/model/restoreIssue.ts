// Translated text for one refused restore row (P5b). Pure; never shows the row's value,
// only the rule and, for OUT_OF_RANGE, the allowed range (ADR 0086).
import type { Dictionary } from "../../i18n";
import type { RestoreIssue } from "../../state/backup";
import { fmtCzk } from "../../lib/format";

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
      const n = (v: number | undefined) =>
        v === undefined ? "—" : fmtCzk(v, { suffix: false });
      return t.backup.issueOutOfRange(n(i.range?.min), n(i.range?.max));
    }
    default:
      return t.inputRules[i.rule];
  }
}
