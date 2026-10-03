// Pure instalment hints for the mortgage edit form (the loan rules themselves are the
// engine's, checked by the store before a save, UX-047).
// Kept out of the page component so they are unit-testable in the node test env
// (no DOM).
import {
  moneyDraft,
  parseDecimal,
  parsePercentToRatio,
  parseIntField,
} from "./formParse";
import { mortgageBlock, suggestedInstalment } from "../../engine";
import type {
  IsoDate,
  LoanRecast,
  Money,
  MortgageBlock,
  MortgageDraw,
  MortgagePrepayment,
  Rate,
} from "../../engine";
import type { Decimal } from "../../lib/money";
import { fmtCzk } from "../../lib/format";
import type { Dictionary } from "../../i18n";

/**
 * Parse the principal / rate / term from an in-progress mortgage draft. Term
 * defaults to 30 yrs when blank (matches the "infer from instalment" save path's
 * typical case). Returns null when the inputs can't yield an instalment yet.
 */
function draftInstalment(
  draft: Record<string, string>,
): { instalment: Decimal; termYears: number } | null {
  const principal = parseDecimal(draft.initialPrincipal ?? "");
  const rate = parsePercentToRatio(draft.interestRatePa ?? "");
  const termYears = parseIntField(draft.loanTermYears ?? "") ?? 30; // default 30
  if (!principal || principal.lessThanOrEqualTo(0) || !rate || termYears <= 0) {
    return null;
  }
  return {
    instalment: suggestedInstalment(principal, rate, termYears),
    termYears,
  };
}

export type LoanType = "standard" | "development";

/** The development-only fields, hidden for a Standard loan (ADR 0098). */
export const DEV_FIELDS = ["draws", "completionDate"] as const;

/** The form's loan type from the block's data; the type is not stored (ADR 0098). */
export function loanTypeOf(draft: Record<string, string>): LoanType {
  return draftIsDev(draft) ? "development" : "standard";
}

/** A draft is a development loan when it carries tranche draws or a completion date. */
function draftIsDev(draft: Record<string, string>): boolean {
  return (
    (draft.draws ?? "").trim() !== "" ||
    (draft.completionDate ?? "").trim() !== ""
  );
}

/** Live "suggested instalment" hint from the in-progress mortgage draft. */
export function suggestedInstalmentHint(
  t: Dictionary,
  draft: Record<string, string>,
): string | null {
  const d = t.propertyDetail;
  const r = draftInstalment(draft);
  if (!r) return draftIsDev(draft) ? d.devTermNeeded : null;
  const base = d.instalmentHint(d.yrs(r.termYears), fmtCzk(r.instalment));
  return draftIsDev(draft) ? d.instalmentHintDev(base) : base;
}

/**
 * Inline "Calc" action on the instalment field: fills it from the other params.
 * Always rendered (for discoverability on a fresh form); disabled — `patch` omitted
 * — until principal + interest rate are valid. For a development loan it fills the
 * instalment that amortizes the *initial* principal over the term (a sensible seed;
 * the engine then re-amortizes at each draw and at completion).
 */
export function instalmentFill(
  t: Dictionary,
  draft: Record<string, string>,
): {
  label: string;
  title: string;
  patch?: Record<string, string> | undefined;
} {
  const d = t.propertyDetail;
  const r = draftInstalment(draft);
  return {
    label: d.calc,
    title: r ? d.calcTitle(d.yrs(r.termYears)) : d.calcDisabled,
    patch: r ? { monthlyInstalment: moneyDraft(r.instalment) } : undefined,
  };
}

/** The mortgage form's parsed values (RecordForm's values for the mortgage specs). */
export interface MortgageFormValues {
  startDate: IsoDate;
  initialPrincipal: Money;
  fixationYears: number;
  loanTermYears: number | null;
  interestRatePa: Rate;
  monthlyInstalment: Money;
  draws: MortgageDraw[] | null;
  completionDate: IsoDate | null;
  /** Absent when the form has no maturity field (the stored value carries over). */
  contractMaturityDate?: IsoDate | null | undefined;
  /** Absent when the form has no event rows (the stored events carry over). */
  prepayments?: MortgagePrepayment[] | null | undefined;
  recasts?: LoanRecast[] | null | undefined;
}

const nonEmpty = <T>(list: T[] | null | undefined): T[] | undefined =>
  list && list.length > 0 ? list : undefined;

/**
 * The mortgage block a submitted form describes. The contract maturity (D-29) comes from
 * its field (UX-054, blank clears it); a caller without that field carries the stored
 * value over (DR-129). Prepayments and recasts likewise: the form's rows replace the
 * stored events (no row clears them), a caller without them carries them over (ADR 0116).
 */
export function mortgageFromForm(
  v: MortgageFormValues,
  id: string,
  propertyId: string,
  existing:
    | Pick<MortgageBlock, "contractMaturityDate" | "prepayments" | "recasts">
    | undefined,
): MortgageBlock {
  return mortgageBlock({
    id,
    propertyId,
    startDate: v.startDate,
    initialPrincipal: v.initialPrincipal,
    fixationYears: v.fixationYears,
    loanTermYears: v.loanTermYears ?? undefined,
    interestRatePa: v.interestRatePa,
    monthlyInstalment: v.monthlyInstalment,
    draws: v.draws && v.draws.length ? v.draws : undefined,
    completionDate: v.completionDate ?? undefined,
    contractMaturityDate:
      "contractMaturityDate" in v
        ? (v.contractMaturityDate ?? undefined)
        : existing?.contractMaturityDate,
    prepayments:
      "prepayments" in v ? nonEmpty(v.prepayments) : existing?.prepayments,
    recasts: "recasts" in v ? nonEmpty(v.recasts) : existing?.recasts,
  });
}
