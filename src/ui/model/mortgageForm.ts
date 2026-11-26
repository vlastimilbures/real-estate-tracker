// Pure instalment hints for the mortgage edit form (the loan rules themselves are the
// engine's, checked by the store before a save).
// Kept out of the page component so they are unit-testable in the node test env
// (no DOM).
import {
  dateDraft,
  moneyDraft,
  parseDecimal,
  percentDraft,
  parsePercentToRatio,
  parseIntField,
  listSpec,
} from "./formParse";
import {
  drawWarnings,
  drawdownTotal,
  drawsDraft,
  hasRows,
  prepaymentsDraft,
  recastsDraft,
  type DrawRow,
  type EventLists,
} from "./loanEventRows";
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
import { CZK, fmtCzk } from "../../lib/format";
import type { Dictionary } from "../../i18n";
import { INT_RANGES } from "../../lib/rules";

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
export function loanTypeOf(
  fields: Record<string, string>,
  draws: readonly DrawRow[] = [],
): LoanType {
  return draftIsDev(fields, draws) ? "development" : "standard";
}

/** The type the form shows: the one chosen, else the data's. */
export function chosenLoanType(
  fields: Record<string, string>,
  draws: readonly DrawRow[],
): LoanType {
  return (fields.loanType ?? loanTypeOf(fields, draws)) as LoanType;
}

/** A draft is a development loan when it carries a tranche row worth saving or a
 *  completion date (ADR 0167: a blank added row alone is not one). */
function draftIsDev(
  fields: Record<string, string>,
  draws: readonly DrawRow[],
): boolean {
  return hasRows(draws) || (fields.completionDate ?? "").trim() !== "";
}

/** The mortgage form's draft: its text fields, with the chosen `loanType` (not a field,
 *  so not unsaved input, ADR 0098), and its row lists. */
export interface MortgageDraft {
  fields: Record<string, string>;
  lists: EventLists;
}

/** The form's draft of a block, or of a new one (null). */
export function mortgageDraft(r: MortgageBlock | null): MortgageDraft {
  const b: Partial<MortgageBlock> = r ?? {};
  const years = (n: number | undefined) => (n != null ? String(n) : "");
  const base = {
    startDate: dateDraft(b.startDate),
    initialPrincipal: moneyDraft(b.initialPrincipal),
    fixationYears: years(b.fixationYears),
    loanTermYears: years(b.loanTermYears),
    interestRatePa: percentDraft(b.interestRatePa),
    monthlyInstalment: moneyDraft(b.monthlyInstalment),
    completionDate: dateDraft(b.completionDate),
    contractMaturityDate: dateDraft(b.contractMaturityDate),
  };
  const lists = {
    draws: drawsDraft(b.draws),
    // Stored events come date-sorted from the mapper (ADR 0116 §11).
    prepayments: prepaymentsDraft(b.prepayments),
    recasts: recastsDraft(b.recasts),
  };
  // The Standard | Development switch starts from the block's data (ADR 0098).
  return {
    fields: { ...base, loanType: loanTypeOf(base, lists.draws) },
    lists,
  };
}

/**
 * The drawdown schedule's notes (ADR 0167): the soft warnings of each tranche row and the
 * total loan footer, or no footer until the start draw is an amount of 0 or more.
 */
export function drawdownNotes(
  t: Pick<Dictionary, "propertyDetail">,
  fields: Record<string, string>,
  draws: readonly DrawRow[],
): { rows: string[][]; footer: string | null } {
  const d = t.propertyDetail;
  const text = {
    afterCompletion: d.warnAfterCompletion,
    sameDate: d.warnSameDate,
  };
  const total = drawdownTotal(fields.initialPrincipal ?? "", draws);
  return {
    rows: drawWarnings(draws, fields.completionDate ?? "").map((w) =>
      w.map((code) => text[code]),
    ),
    footer: total && d.drawdownTotal(fmtCzk(total.total), total.tranches),
  };
}

/** Live "suggested instalment" hint from the in-progress mortgage draft. */
export function suggestedInstalmentHint(
  t: Pick<Dictionary, "propertyDetail">,
  fields: Record<string, string>,
  draws: readonly DrawRow[] = [],
): string | null {
  const d = t.propertyDetail;
  const r = draftInstalment(fields);
  const dev = draftIsDev(fields, draws);
  if (!r) return dev ? d.devTermNeeded : null;
  const base = d.instalmentHint(d.yrs(r.termYears), fmtCzk(r.instalment));
  return dev ? d.instalmentHintDev(base) : base;
}

/**
 * Inline "Calc" action on the instalment field: fills it from the other params.
 * Always rendered (for discoverability on a fresh form); disabled — `patch` omitted
 * — until principal + interest rate are valid. For a development loan it fills the
 * instalment that amortizes the *initial* principal over the term (a sensible seed;
 * the engine then re-amortizes at each draw and at completion).
 */
export function instalmentFill(
  t: Pick<Dictionary, "propertyDetail">,
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
 * The mortgage block a submitted form describes. The contract maturity (ADR 0029) comes
 * from its field (blank clears it); a caller without that field carries the stored value
 * over. Prepayments and recasts likewise: the form's rows replace the stored events (no
 * row clears them), a caller without them carries them over (ADR 0116).
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
    draws: nonEmpty(v.draws),
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

/** The mortgage form's fields in grid order; the row lists among them take their values
 *  from the draft's lists. Typed literally, so the values are typed by them. */
export function mortgageSpecs(t: Dictionary) {
  return [
    {
      name: "startDate",
      label: t.propertyDetail.fieldStartDate,
      kind: "date",
    },
    // Development only: the start draw (the initial principal) is its first row
    // (ADR 0167).
    listSpec<MortgageDraw[]>()({
      name: "draws",
      label: t.propertyDetail.fieldDraws,
      help: t.propertyDetail.helpDraws,
      lead: {
        field: "initialPrincipal",
        dateField: "startDate",
        label: t.propertyDetail.drawnAtStart,
        dateFallback: t.propertyDetail.drawnAtStartNoDate,
      },
    }),
    {
      name: "initialPrincipal",
      label: t.propertyDetail.fieldInitialPrincipal,
      kind: "money",
      suffix: CZK.symbol,
    },
    {
      name: "fixationYears",
      label: t.propertyDetail.fieldFixationYears,
      kind: "int",
      suffix: t.common.yearsSuffix,
      range: INT_RANGES.fixationYears,
    },
    {
      name: "loanTermYears",
      label: t.propertyDetail.fieldLoanTermYears,
      kind: "int",
      suffix: t.common.yearsSuffix,
      range: INT_RANGES.loanTermYears,
      optional: true,
      help: t.propertyDetail.helpLoanTermYears,
    },
    {
      name: "interestRatePa",
      label: t.propertyDetail.fieldInterestRate,
      kind: "pct",
      suffix: "%",
    },
    {
      name: "monthlyInstalment",
      label: t.propertyDetail.fieldMonthlyInstalment,
      kind: "money",
      suffix: CZK.symbol,
    },
    {
      name: "completionDate",
      label: t.propertyDetail.fieldCompletionDate,
      kind: "date",
      optional: true,
      help: t.propertyDetail.helpCompletionDate,
    },
    ...laterSpecs(t),
  ] as const;
}

/** The fields after the completion date: the contract maturity and the event lists. */
function laterSpecs(t: Pick<Dictionary, "propertyDetail">) {
  return [
    {
      name: "contractMaturityDate",
      label: t.propertyDetail.fieldContractMaturity,
      kind: "date",
      optional: true,
      help: t.propertyDetail.helpContractMaturity,
    },
    listSpec<MortgagePrepayment[]>()({
      name: "prepayments",
      label: t.propertyDetail.fieldPrepayments,
      help: t.propertyDetail.helpPrepayments,
    }),
    listSpec<LoanRecast[]>()({
      name: "recasts",
      label: t.propertyDetail.fieldRecasts,
      help: t.propertyDetail.helpRecasts,
    }),
  ] as const;
}
