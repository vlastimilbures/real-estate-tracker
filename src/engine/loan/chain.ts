// One block's schedule and a property's refinance chain (ADR 0027).
import { ZERO, type Decimal } from "../../lib/money";
import { isOnOrBefore } from "../dates";
import { drawMonth, dueDate } from "../loanTerm";
import { cutAfter } from "../loanBlock";
import { afterSuccessor, type ChainLink, chainLinks } from "./blockChain";
import { at } from "../arrays";
import {
  assertAssumptions,
  assertBlockStarts,
  assertLoanInputs,
  assertLoanRows,
} from "../validate";
import type {
  AmortizationRow,
  Assumptions,
  IsoDate,
  LoanEventOutcome,
  MortgageBlock,
  Refinance,
} from "../types";
import { paymentOffset } from "./calendar";
import { clampPrepayment, type Outcome } from "./events";
import { type BlockSchedule, buildBlockSchedule } from "./grid";
import { lastPaymentMonth } from "./queries";

// ---------------------------------------------------------------------------
// Public schedule API
// ---------------------------------------------------------------------------

/** One block's schedule and its event outcomes; raises on an invalid loan (ADR 0017). */
function blockSchedule(
  block: MortgageBlock,
  assumptions: Assumptions,
): BlockSchedule {
  assertLoanInputs(block);
  return buildBlockSchedule(block, assumptions);
}

/**
 * Month-by-month schedule for one block, from baseDate for at least `horizonYears*12`
 * months (longer when the loan needs its full term). A future block is undrawn (zero
 * rows) until the first grid month on/after `startDate`, where it draws
 * `initialPrincipal` and then amortizes. Plain loans reproduce the parity targets
 * byte-for-byte.
 * An invalid loan raises an EngineInputError (ADR 0017).
 * @internal test seam: one loan's schedule; the app runs `propertySchedules`.
 */
export function buildSchedule(
  block: MortgageBlock,
  assumptions: Assumptions,
): AmortizationRow[] {
  return blockSchedule(block, assumptions).rows;
}

/**
 * Due date of a block's last payment in its own base schedule, after its prepayments
 * and recasts: the maturity in force (ADR 0116). Events dated after `next`'s start are
 * dropped, as in the chain. An instalment above the annuity can end it before the
 * entered term.
 * It builds the block's own schedule on purpose (#477): the chain's rows cannot give
 * this date, since a successor replaces them from the month it draws in, and its one
 * caller, `blocksReachedByShock`, builds no chain schedule to share.
 */
export function effectiveMaturity(
  block: MortgageBlock,
  assumptions: Assumptions,
  next?: MortgageBlock,
): IsoDate {
  const b = next ? cutAt(block, next).block : block;
  const { rows } = blockSchedule(b, assumptions);
  return dueDate(
    b,
    paymentOffset(b, assumptions.baseDate) + lastPaymentMonth(rows),
  );
}

// ---------------------------------------------------------------------------
// Refinance chains (ADR 0027)
// ---------------------------------------------------------------------------

/**
 * Splice `next` into the chain's rows from its draw month `d` (ADR 0027). The owner's
 * payment in month d is still paid when due on/before the successor's start, and the
 * draw row carries it; otherwise the owner pays off its balance before month d plus
 * the tranches it drew in month d (ADR 0138 §1). The owner never draws in month d
 * itself: two blocks starting within a month are refused (ADR 0226 §2).
 * A prepayment dated on/before the successor's start that the owner's dropped rows
 * carried is paid at the handover, before the successor pays off the rest (ADR 0109).
 * The merged row's `drawn` is real new debt only; `refinanced` is the successor's
 * principal less the balance it pays off (ADR 0130). A kept row keeps the owner's due
 * date; the successor's draw row has none unless it pays a handover prepayment (then
 * the owner's month-d due date), and its later rows fall due on its own cadence
 * (ADR 0164).
 */
function spliceSuccessor(
  current: BlockSchedule,
  owner: MortgageBlock,
  next: MortgageBlock,
  assumptions: Assumptions,
): BlockSchedule & { refinance: Refinance } {
  const { rows } = current;
  const { baseDate } = assumptions;
  const d = drawMonth(next, baseDate);
  const successor = blockSchedule(next, assumptions);
  const nextRows = successor.rows;
  const drawRow = at(nextRows, d - 1);
  // Rows past the owner's schedule are undrawn months of the successor.
  const head = [...rows.slice(0, d - 1), ...nextRows.slice(rows.length, d - 1)];
  const own = rows[d - 1];
  const due = dueDate(owner, paymentOffset(owner, baseDate) + d);
  const kept =
    own !== undefined &&
    own.interest.plus(own.principal).greaterThan(ZERO) &&
    isOnOrBefore(due, next.startDate);
  const { before, carriedIn } = handoverBalances(head, own, d);
  // A dropped row's tranches are dated on/before the successor's start (`cutAt`): the
  // successor pays them off too, as `before` already holds them in grid month 1.
  const owed =
    own && kept ? own.endBalance : before.plus(d > 1 && own ? own.drawn : ZERO);
  const late = handoverPrepayments(current.outcomes, owner, { d, kept, owed });
  const row = handoverRow(drawRow, own, kept);
  const prepaid = row.prepaid.plus(late.applied);
  // The rest of the handover's net new debt (ADR 0027) is the refinance difference.
  const drawn = handoverDrawn(drawRow, next, own);
  const netNew = row.endBalance
    .minus(carriedIn)
    .plus(row.principal)
    .plus(prepaid);
  const merged = {
    ...row,
    // A replaced row paying the owner's handover prepayment falls due on the owner's
    // month-d date (ADR 0164).
    dueDate: row.dueDate ?? (prepaid.greaterThan(ZERO) ? due : null),
    prepaid,
    prepaymentFee: row.prepaymentFee.plus(late.fee),
    drawn,
    refinanced: netNew.minus(drawn),
  };
  return {
    rows: [...head, merged, ...nextRows.slice(d)],
    outcomes: [...late.outcomes, ...successor.outcomes],
    refinance: {
      month: d,
      paidOff: owed.minus(late.applied),
      drawn: next.initialPrincipal,
    },
  };
}

/**
 * The owner's events in rows the handover drops (month d unless kept, and later):
 * each prepayment is paid at the handover, in order, out of the balance `owed`; a
 * recast no longer applies, as the successor replaces the loan (ADR 0109). A kept
 * month-d prepayment no longer reports the owner's term: the owner pays nothing after
 * it (ADR 0179).
 */
function handoverPrepayments(
  outcomes: Outcome[],
  owner: MortgageBlock,
  { d, kept, owed }: { d: number; kept: boolean; owed: Decimal },
): { applied: Decimal; fee: Decimal; outcomes: Outcome[] } {
  const dropped = (o: Outcome) =>
    o.blockId === owner.id &&
    o.month !== null &&
    (o.month > d || (o.month === d && !(kept && o.kind === "prepayment")));
  let [left, applied, fee] = [owed, ZERO, ZERO];
  const out = outcomes.map((o): Outcome => {
    if (!dropped(o)) {
      return o.blockId === owner.id &&
        o.month === d &&
        o.issue === "PREPAYMENT_TERM_NOT_SHORTENED"
        ? { ...o, issue: null }
        : o;
    }
    if (o.kind === "recast")
      return { ...o, month: null, issue: "RECAST_REPLACED" };
    const {
      applied: paid,
      charged,
      issue,
    } = clampPrepayment(o.requested, left, o.enteredFee);
    [left, applied, fee] = [
      left.minus(paid),
      applied.plus(paid),
      fee.plus(charged),
    ];
    return { ...o, month: d, applied: paid, fee: charged, issue };
  });
  return { applied, fee, outcomes: out };
}

/**
 * The row a handover starts from: the owner's kept row ending on the successor's draw,
 * else the successor's draw row.
 */
function handoverRow(
  drawRow: AmortizationRow,
  own: AmortizationRow | undefined,
  kept: boolean,
): AmortizationRow {
  return own && kept ? { ...own, endBalance: drawRow.endBalance } : drawRow;
}

/**
 * A handover row's real new debt (ADR 0130): a tranche the successor draws with its
 * principal, plus the tranches the owner's month-d row drew, which the balance the
 * successor pays off always holds (ADR 0138 §1).
 */
function handoverDrawn(
  drawRow: AmortizationRow,
  next: MortgageBlock,
  own: AmortizationRow | undefined,
): Decimal {
  return drawRow.drawn.minus(next.initialPrincipal).plus(own?.drawn ?? ZERO);
}

/**
 * The owner's balance going into the handover month `d` (`before`, what the successor
 * pays off unless the owner's month-d row is kept) and the balance carried into the
 * merged row: the handover's net new debt is what the successor draws, less the
 * predecessor balance it pays off, plus anything the kept row itself drew. In grid month
 * 1 that is the row's opening balance before its tranches: the owner's row there is never
 * itself a handover, as two blocks starting within a month are refused (ADR 0226 §2).
 */
function handoverBalances(
  head: AmortizationRow[],
  own: AmortizationRow | undefined,
  d: number,
): { before: Decimal; carriedIn: Decimal } {
  if (d > 1) {
    const before = head.at(-1)?.endBalance ?? ZERO;
    return { before, carriedIn: before };
  }
  if (!own) return { before: ZERO, carriedIn: ZERO };
  const before = own.endBalance.plus(own.principal).plus(own.prepaid);
  return {
    before,
    carriedIn: before.minus(own.drawn),
  };
}

/** An event a successor replaced before it applied (ADR 0109). */
function replacedOutcome(
  block: MortgageBlock,
  kind: Outcome["kind"],
  e: { date: IsoDate; amount?: Decimal },
): Outcome {
  return {
    blockId: block.id,
    kind,
    date: e.date,
    month: null,
    requested: e.amount ?? ZERO,
    applied: ZERO,
    fee: ZERO,
    issue: kind === "prepayment" ? "PREPAYMENT_REPLACED" : "RECAST_REPLACED",
  };
}

/** A block cut at its successor's start: its tranches, prepayments and recasts dated
 *  after it are dropped, the events reported (ADR 0027, ADR 0109). */
function cutAt(
  block: MortgageBlock,
  next: MortgageBlock,
): { block: MortgageBlock; dropped: Outcome[] } {
  const replaced = (e: { date: Date }) => afterSuccessor(next, e.date);
  const dropped = [
    ...(block.prepayments ?? [])
      .filter(replaced)
      .map((p) => replacedOutcome(block, "prepayment", p)),
    ...(block.recasts ?? [])
      .filter(replaced)
      .map((r) => replacedOutcome(block, "recast", r)),
  ];
  return { block: cutAfter(block, next.startDate), dropped };
}

/**
 * Drop each block's tranches dated after its successor's start: the successor replaces
 * the block from that date, so they are never drawn, even one in the successor's draw
 * month that the kept draw row would otherwise carry (ADR 0027). Its prepayments and
 * recasts dated after that start go too, and are reported (ADR 0109).
 */
function untilSuccessor(links: ChainLink[]): {
  chain: MortgageBlock[];
  dropped: Outcome[];
} {
  const cut = links.map(({ block, next }) =>
    next ? cutAt(block, next) : { block, dropped: [] },
  );
  return {
    chain: cut.map((c) => c.block),
    dropped: cut.flatMap((c) => c.dropped),
  };
}

/** One property's schedule rows, the refinance handovers it made, and what its
 *  prepayments and recasts did (ADR 0109). */
export interface PropertySchedule {
  rows: AmortizationRow[];
  refinances: Refinance[];
  eventOutcomes: LoanEventOutcome[];
}

/** The schedule of a property without a loan: no rows, refinances or events. */
export const EMPTY_PROPERTY_SCHEDULE: PropertySchedule = Object.freeze({
  rows: [],
  refinances: [],
  eventOutcomes: [],
});

/**
 * One property's schedule on the baseDate grid, following its refinance chain: each
 * successor block starting after baseDate replaces its predecessor from the grid month it
 * draws in (ADR 0027), with the handovers it made. Blocks on the same start overlap and
 * raise DUPLICATE_BLOCK_START (ADR 0027). No block ⇒ no rows.
 */
export function propertySchedule(
  blocks: MortgageBlock[],
  assumptions: Assumptions,
): PropertySchedule {
  assertLoanRows(blocks); // ADR 0037
  assertBlockStarts(blocks);
  const { chain, dropped } = untilSuccessor(
    chainLinks(blocks, assumptions.baseDate),
  );
  const [first, ...successors] = chain;
  if (!first) return { rows: [], refinances: [], eventOutcomes: [] };
  let schedule = blockSchedule(first, assumptions);
  let owner = first;
  const refinances: Refinance[] = [];
  for (const next of successors) {
    const step = spliceSuccessor(schedule, owner, next, assumptions);
    schedule = step;
    refinances.push(step.refinance);
    owner = next;
  }
  return {
    rows: schedule.rows,
    refinances,
    eventOutcomes: [...schedule.outcomes, ...dropped].map(publicOutcome),
  };
}

/** A copy of the outcome without the internal entered fee, its fields in order. */
function publicOutcome(o: Outcome): LoanEventOutcome {
  const copy: Outcome = { ...o };
  delete copy.enteredFee;
  return copy;
}

/**
 * `propertySchedule` for every property keyed by propertyId (no rows if no debt), built
 * once so the snapshot, projection and KPIs can share it.
 */
export function propertySchedules(
  mortgages: MortgageBlock[],
  propertyIds: string[],
  assumptions: Assumptions,
): Map<string, PropertySchedule> {
  assertAssumptions(assumptions); // ADR 0037
  const result = new Map<string, PropertySchedule>();
  for (const pid of propertyIds) {
    const propBlocks = mortgages.filter((b) => b.propertyId === pid);
    result.set(pid, propertySchedule(propBlocks, assumptions));
  }
  return result;
}

/** The rows of each property's schedule (see `propertySchedules`). */
export function scheduleRows(
  schedules: Map<string, PropertySchedule>,
): Map<string, AmortizationRow[]> {
  return new Map([...schedules].map(([pid, s]) => [pid, s.rows]));
}
