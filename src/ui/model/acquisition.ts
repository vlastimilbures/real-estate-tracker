// Pure presentation model for the purchase's funding (ADR 0119 §4, §9): the Property
// detail Acquisition section.
import type { AcquisitionSummary } from "../../engine";
import type { Decimal } from "../../lib/money";
import { fmtCzk } from "../../lib/format";
import type { Dictionary } from "../../i18n";

/** A gap below this many Kč either way is rounding, not a warning (ADR 0119 §9). */
const GAP_MIN = 1;

export interface AcquisitionRow {
  label: string;
  value: Decimal | null;
  /** Shown instead of a null value: "—" for not recorded, "None" for no loan. */
  missing: string;
}

export interface AcquisitionView {
  rows: AcquisitionRow[];
  /** The sources & uses gap, never a blocker; null while own cash is unknown. */
  warning: string | null;
  note: string | null;
}

export function acquisitionView(
  s: AcquisitionSummary,
  note: string | undefined,
  d: Dictionary["propertyDetail"],
): AcquisitionView {
  const row = (label: string, value: Decimal | null, missing = "—") => ({
    label,
    value,
    missing,
  });
  const gap = s.gap;
  return {
    rows: [
      row(d.acqPrice, s.price),
      row(d.acqTransactionCosts, s.transactionCosts),
      row(d.acqInitialWorks, s.initialWorks),
      row(d.acqUses, s.uses),
      row(d.acqCashInvested, s.ownCash),
      row(d.acqLoan, s.loan, d.acqLoanNone),
      row(d.acqSources, s.sources),
    ],
    warning:
      gap === null || gap.abs().lessThan(GAP_MIN)
        ? null
        : gap.isPositive()
          ? d.acqGapShort(fmtCzk(gap))
          : d.acqGapOver(fmtCzk(gap.abs())),
    note: note?.trim() ? d.acqRecordedNote(note.trim()) : null,
  };
}
