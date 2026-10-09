// Pure presentation model for PropertyDetail's loan warnings (UX-054): instalment health,
// contract maturity and an expired fixation, for every block from the one in force onward.
// Also the Loan outlook: payoff, remaining term and each block's reset (ADR 0116, 0117).
import {
  amortizationHealth,
  blockEndDate,
  edate,
  fixationExpired,
  isDevLoan,
  maturityMismatch,
  monthsBetween,
  selectBlock,
} from "../../engine";
import type {
  AmortizationRow,
  Drawdown,
  DrawdownTranche,
  FixationReset,
  IsoDate,
  LoanEventIssue,
  LoanEventOutcome,
  MortgageBlock,
  PropertyLoan,
  Rate,
} from "../../engine";
import type { XlsxColumn } from "./xlsxExport";
import { nonZeroColumns } from "./columns";
import { interestSavedShown, type InterestSavedShown } from "./financing";
import { ZERO, type Decimal } from "../../lib/money";
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
  /** The fixation ended on/before baseDate and no follow-on block is entered (D-30),
   *  or the next one starts only on `until`, after the first floating payment
   *  (ADR 0129 §4). */
  | {
      kind: "fixationEnded";
      block: MortgageBlock;
      fixationEnd: Date;
      until?: Date;
    }
  /** A prepayment or recast the engine clamped, ignored or dropped (ADR 0116 §10). */
  | {
      kind: "event";
      block: MortgageBlock;
      outcome: LoanEventOutcome & { issue: LoanEventIssue };
    };

/**
 * The months an ended fixation runs at the assumed reset rate: from its end, unless the
 * next block starts before the first payment after it falls due — until that block, if
 * there is one (D-30, ADR 0129 §4). Undefined while the fixation runs or the next block
 * covers it.
 */
function refixGap(
  current: MortgageBlock,
  next: MortgageBlock | undefined,
  baseDate: Date,
): { fixationEnd: Date; until?: Date } | undefined {
  if (!fixationExpired(current, baseDate)) return undefined;
  const fixationEnd = blockEndDate(current);
  if (!next) return { fixationEnd };
  const firstFloating = edate(
    current.startDate,
    current.fixationYears * 12 + 1,
  );
  // A payment due on the next block's start stays with this one (D-47).
  return next.startDate.getTime() >= firstFloating.getTime()
    ? { fixationEnd, until: next.startDate }
    : undefined;
}

/**
 * Warnings for a property's loan: every block from the one in force at baseDate (or the
 * earliest upcoming) onward, so a follow-on block is checked too (DR-125). A block a
 * later one replaced before baseDate is history and is skipped. Development loans have
 * an engine-derived instalment and an explicit term, so they get neither the instalment
 * nor the maturity check. Event outcomes with an issue follow, on their block (ADR 0116).
 */
export function loanWarnings(
  mortgages: MortgageBlock[],
  baseDate: Date,
  outcomes: LoanEventOutcome[] = [],
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
  const gap = refixGap(current, chain[1], baseDate);
  if (gap) out.push({ kind: "fixationEnded", block: current, ...gap });
  for (const outcome of outcomes) {
    const block = mortgages.find((b) => b.id === outcome.blockId);
    if (block && outcome.issue !== null)
      out.push({
        kind: "event",
        block,
        outcome: { ...outcome, issue: outcome.issue },
      });
  }
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
      return `${head} ${
        w.until
          ? d.fixationEndedUntil(
              fmtDate(w.fixationEnd),
              fmtDate(w.until),
              fmtPct(resetRate),
            )
          : d.fixationEnded(fmtDate(w.fixationEnd), fmtPct(resetRate))
      }`;
    case "event": {
      const o = w.outcome;
      const text = d.eventIssue[o.issue](
        fmtDate(o.date),
        fmtCzk(o.requested),
        fmtCzk(o.applied),
      );
      return `${head} ${text}`;
    }
  }
}

/** A block's row status in the Loan outlook (ADR 0117). */
export type LoanOutlookStatus =
  FixationReset["status"] | "nextReset" | "floating";

/** One loan block in the Loan outlook's reset table (ADR 0117). */
export interface LoanOutlookRow {
  blockId: string;
  start: string;
  /** "—" for a floating (0-year) block. */
  fixationEnd: string;
  /** The nominal balance after the fixation-end payment; upcoming resets only. */
  balance: Decimal | null;
  status: LoanOutlookStatus;
  label: string;
}

/** One draw of a development loan in the Loan outlook (ADR 0167). */
export interface DrawdownRow {
  date: string;
  /** "Drawn at start" or "Tranche n". */
  draw: string;
  amount: Decimal;
  status: DrawdownTranche["status"];
  label: string;
}

/** A development loan's drawdown in the Loan outlook (ADR 0167 §6). */
export interface DrawdownView {
  blockId: string;
  /** Drawn ÷ total, for the bar (0 when nothing counts). */
  share: Decimal;
  full: boolean;
  /** "Drawn X of Y (Z %)", or "Fully drawn: Y". */
  progress: string;
  /** The interest-only end, when set. */
  completion: string | null;
  rows: DrawdownRow[];
}

export interface LoanOutlook {
  payoff: string;
  /** Null once repaid or with no payment left to count. */
  remainingTerm: string | null;
  /** Null hides the line; "n/a" shows the note (ADR 0130). */
  interestSaved: InterestSavedShown | null;
  resets: LoanOutlookRow[];
  drawdowns: DrawdownView[];
}

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

/**
 * The Loan outlook of a property's loan: payoff, remaining term, interest saved and every
 * block oldest first with its fixation end, balance at reset and status (ADR 0117). A
 * block outside the chain was replaced before baseDate; a chain block without a reset is
 * floating.
 */
export function loanOutlook(
  financing: PropertyLoan,
  blocks: MortgageBlock[],
  d: Dictionary["propertyDetail"],
): LoanOutlook {
  const { loan } = financing;
  const resets = new Map(financing.resets.map((r) => [r.blockId, r]));
  const chain = new Set(financing.chain);
  const statusOf = (
    b: MortgageBlock,
    reset: FixationReset | undefined,
  ): LoanOutlookStatus => {
    if (!chain.has(b.id)) return "replaced";
    if (!reset) return "floating";
    return b.id === loan.nextFixation?.blockId ? "nextReset" : reset.status;
  };
  const rows = [...blocks]
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
    .map((b): LoanOutlookRow => {
      const reset = resets.get(b.id);
      const status = statusOf(b, reset);
      return {
        blockId: b.id,
        start: fmtDate(b.startDate),
        fixationEnd: b.fixationYears === 0 ? "—" : fmtDate(blockEndDate(b)),
        balance: reset?.status === "upcoming" ? reset.balance : null,
        status,
        label: d.outlookStatus[status],
      };
    });
  return {
    payoff: loan.payoffDate ? fmtDate(loan.payoffDate) : d.loanPayoffNone,
    remainingTerm: loan.remainingMonths
      ? remainingTermText(loan.remainingMonths, d)
      : null,
    interestSaved: interestSavedShown(loan.interestSaved),
    resets: rows,
    drawdowns: financing.drawdowns.map((dd) =>
      drawdownView(
        dd,
        blocks.find((b) => b.id === dd.blockId),
        d,
      ),
    ),
  };
}

function drawdownView(
  dd: Drawdown,
  block: MortgageBlock | undefined,
  d: Dictionary["propertyDetail"],
): DrawdownView {
  const share = dd.total.isZero() ? ZERO : dd.drawn.div(dd.total);
  const full = dd.drawn.equals(dd.total);
  let n = 0;
  return {
    blockId: dd.blockId,
    share,
    full,
    progress: full
      ? d.drawdownFull(fmtCzk(dd.total))
      : d.drawdownProgress(fmtCzk(dd.drawn), fmtCzk(dd.total), fmtPct(share)),
    completion: block?.completionDate ? fmtDate(block.completionDate) : null,
    rows: dd.tranches.map((t) => ({
      date: fmtDate(t.date),
      draw: t.start ? d.drawnAtStart : d.trancheRow(++n),
      amount: t.amount,
      status: t.status,
      label: d.drawStatus[t.status],
    })),
  };
}

/**
 * The optional columns with their headers, each shown only when some row is non-zero
 * (ADR 0116 §12): the balance then reconciles on screen and in the export.
 */
export function amortizationExtras(
  rows: AmortizationRow[],
  d: Dictionary["propertyDetail"],
) {
  return nonZeroColumns(rows, [
    { key: "drawn", header: d.amColDrawn },
    { key: "refinanced", header: d.amColRefinanced },
    { key: "prepaid", header: d.amColPrepaid },
    { key: "prepaymentFee", header: d.amColPrepaymentFee },
  ]);
}

/** Excel column map for the amortization schedule, headers as on screen (UX-062). */
export function amortizationColumns(
  t: Pick<Dictionary, "propertyDetail">,
  rows: AmortizationRow[],
): XlsxColumn<AmortizationRow>[] {
  const d = t.propertyDetail;
  return [
    { header: d.amColMonth, kind: "int", value: (r) => r.month },
    { header: d.amColDate, kind: "date", value: (r) => r.dueDate },
    { header: d.amColRate, kind: "rate", value: (r) => r.ratePa },
    { header: d.amColInstalment, kind: "money", value: (r) => r.instalment },
    { header: d.amColInterest, kind: "money", value: (r) => r.interest },
    { header: d.amColPrincipal, kind: "money", value: (r) => r.principal },
    ...amortizationExtras(rows, d).map(
      ({ key, header }): XlsxColumn<AmortizationRow> => ({
        header,
        kind: "money",
        value: (r) => r[key],
      }),
    ),
    { header: d.amColEndBalance, kind: "money", value: (r) => r.endBalance },
  ];
}
