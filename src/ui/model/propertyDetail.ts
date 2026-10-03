// Pure presentation model for PropertyDetail's loan warnings (UX-054): instalment health,
// contract maturity and an expired fixation, for every block from the one in force onward.
import {
  amortizationHealth,
  blockEndDate,
  fixationExpired,
  isDevLoan,
  maturityMismatch,
  monthsBetween,
  selectBlock,
} from "../../engine";
import type {
  AmortizationRow,
  IsoDate,
  MortgageBlock,
  Rate,
} from "../../engine";
import type { XlsxColumn } from "./xlsxExport";
import type { Decimal } from "../../lib/money";
import { fmtCzk, fmtDate, fmtPct } from "../../lib/format";
import type { Dictionary } from "../../i18n";

/** One loan warning on Property detail (UX-054). */
export type LoanWarning =
  /** The instalment does not repay the block by its term (closed-form health). */
  | { kind: "underpays"; block: MortgageBlock; suggestedInstalment: Decimal }
  /** The instalment-implied maturity is > 1 month from the contract's (D-29).
   *  `months` = implied − contract: positive ⇒ the loan is paid off later. */
  | {
      kind: "maturity";
      block: MortgageBlock;
      implied: IsoDate;
      contract: IsoDate;
      months: number;
    }
  /** The fixation ended on/before baseDate and no follow-on block is entered (D-30). */
  | { kind: "fixationEnded"; block: MortgageBlock; fixationEnd: Date };

/**
 * Warnings for a property's loan: every block from the one in force at baseDate (or the
 * earliest upcoming) onward, so a follow-on block is checked too (DR-125). A block a
 * later one replaced before baseDate is history and is skipped. Development loans have
 * an engine-derived instalment and an explicit term, so they get neither the instalment
 * nor the maturity check.
 */
export function loanWarnings(
  mortgages: MortgageBlock[],
  baseDate: Date,
): LoanWarning[] {
  const current = selectBlock(mortgages, baseDate);
  if (!current) return [];
  const chain = mortgages
    .filter((b) => b.startDate.getTime() >= current.startDate.getTime())
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const out: LoanWarning[] = [];
  for (const block of chain) {
    if (isDevLoan(block)) continue;
    const health = amortizationHealth(block);
    if (!health.fullyAmortizes)
      out.push({
        kind: "underpays",
        block,
        suggestedInstalment: health.suggestedInstalment,
      });
    const m = maturityMismatch(block);
    if (m)
      out.push({
        kind: "maturity",
        block,
        ...m,
        months: monthsBetween(m.contract, m.implied),
      });
  }
  if (chain.length === 1 && fixationExpired(current, baseDate))
    out.push({
      kind: "fixationEnded",
      block: current,
      fixationEnd: blockEndDate(current),
    });
  return out;
}

/** The warning as one sentence in the user's language. */
export function loanWarningText(
  t: Pick<Dictionary, "propertyDetail">,
  w: LoanWarning,
  resetRate: Rate,
): string {
  const d = t.propertyDetail;
  const head = d.loanFrom(fmtDate(w.block.startDate));
  switch (w.kind) {
    case "underpays":
      return `${head} ${d.amortizationWarn} ${d.amortizationWarnExpected} ${fmtCzk(w.suggestedInstalment)}.`;
    case "maturity": {
      const months = d.monthsCount(Math.abs(w.months));
      const contract = fmtDate(w.contract);
      return [
        head,
        d.maturityPaysOff(
          fmtCzk(w.block.monthlyInstalment),
          fmtDate(w.implied),
        ),
        w.months > 0
          ? d.maturityAfter(months, contract)
          : d.maturityBefore(months, contract),
        d.maturityCheck,
      ].join(" ");
    }
    case "fixationEnded":
      return `${head} ${d.fixationEnded(fmtDate(w.fixationEnd), fmtPct(resetRate))}`;
  }
}

/** Excel column map for the amortization schedule, headers as on screen (UX-062). */
export function amortizationColumns(
  t: Pick<Dictionary, "propertyDetail">,
): XlsxColumn<AmortizationRow>[] {
  const d = t.propertyDetail;
  return [
    { header: d.amColMonth, kind: "int", value: (r) => r.month },
    { header: d.amColDate, kind: "date", value: (r) => r.date },
    { header: d.amColRate, kind: "rate", value: (r) => r.ratePa },
    { header: d.amColInstalment, kind: "money", value: (r) => r.instalment },
    { header: d.amColInterest, kind: "money", value: (r) => r.interest },
    { header: d.amColPrincipal, kind: "money", value: (r) => r.principal },
    { header: d.amColEndBalance, kind: "money", value: (r) => r.endBalance },
  ];
}
