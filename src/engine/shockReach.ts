// Which loan blocks a scenario rate shock reaches (ADR 0100), for the Scenarios page's
// note. It walks the chain the schedule follows (`chainLinks`) and reads each block's
// fixation end as `rateAt` does (`rateFixedUntil`); each block's maturity in force comes
// from its schedule (ADR 0116). No rate maths: a block is hit when its first payment past
// the fixation end and baseDate is shocked and counted.
import { dueDate } from "./loanTerm";
import { rateFixedUntil } from "./loanRate";
import { edate, isAfter } from "./dates";
import {
  afterSuccessor,
  chainLinks,
  effectiveMaturity,
  replacedByMonth,
  type ChainLink,
} from "./schedule";
import { paymentOffset } from "./loan/calendar";
import type { Assumptions, IsoDate, Portfolio, ShockBand } from "./types";
import { yearsToMonths } from "./units";
import { activeProperties } from "./selectors";

/** Why a block's payments miss the shock window. */
export type ShockMissReason =
  | "fixedToMaturity"
  | "repaid"
  | "windowEnded"
  | "replacedBySuccessor"
  | "refixAfterHorizon";

/** One block of a loan: hit or the reason it is missed, and the date its entered rate
 *  ends (`rateFixedUntil`: the fixation end, or baseDate / a later start for a floating
 *  block, ADR 0162). */
export interface BlockShockReach {
  blockId: string;
  hit: boolean;
  reason?: ShockMissReason;
  fixedUntil: Date;
}

/** One loan = one property's block chain. */
export interface LoanShockReach {
  propertyId: string;
  blocks: BlockShockReach[];
}

/** Per active property with a mortgage, in property order: each block of its chain and
 *  whether `shock` reaches one of its payments. Raises (EngineInputError) on a loan the
 *  schedule refuses. */
export function blocksReachedByShock(
  portfolio: Portfolio,
  assumptions: Assumptions,
  shock: ShockBand,
): LoanShockReach[] {
  return activeProperties(portfolio.properties).flatMap((p) => {
    const links = chainLinks(
      portfolio.mortgages.filter((m) => m.propertyId === p.id),
      assumptions.baseDate,
    );
    if (links.length === 0) return [];
    const blocks = links.map((l) => blockReach(l, assumptions, shock));
    return [{ propertyId: p.id, blocks }];
  });
}

function blockReach(
  link: ChainLink,
  a: Assumptions,
  shock: ShockBand,
): BlockShockReach {
  const blockId = link.block.id;
  const fixedUntil = rateFixedUntil(link.block, a.baseDate);
  const reason = missReason(link, a, shock, fixedUntil);
  return reason
    ? { blockId, hit: false, reason, fixedUntil }
    : { blockId, hit: true, fixedUntil };
}

/**
 * Payment k of a block is due EDATE(start, k) and sits in the baseDate grid row
 * k − offset. The shock reaches it when it is due after the fixation end and after
 * baseDate and on or before fixation end + N years, and the projection counts it: up to
 * maturity, in the horizon, before the successor takes over. Every bound but the first
 * two is an upper bound, so the first payment past both lower bounds decides.
 */
function missReason(
  link: ChainLink,
  a: Assumptions,
  shock: ShockBand,
  fixEnd: Date,
): ShockMissReason | undefined {
  const b = link.block;
  // The maturity in force after prepayments and recasts (ADR 0116). The base schedule
  // decides: before the fixation end the shock changes no rate, so no event.
  const maturity: IsoDate = effectiveMaturity(b, a, link.next);
  // A floating block has no fixation to run to maturity (ADR 0162): repaid by baseDate,
  // it misses as repaid below.
  if (b.fixationYears > 0 && !isAfter(maturity, fixEnd))
    return "fixedToMaturity";
  const offset = paymentOffset(b, a.baseDate);
  const k = Math.max(1, offset + 1, yearsToMonths(b.fixationYears) + 1);
  const due = dueDate(b, k);
  const row = k - offset;
  if (isAfter(due, maturity)) return "repaid";
  if (isAfter(due, edate(fixEnd, yearsToMonths(shock.durationYears))))
    return "windowEnded";
  if (replacedAt(link, row, due, a.baseDate)) return "replacedBySuccessor";
  if (row > yearsToMonths(a.horizonYears)) return "refixAfterHorizon";
  return undefined;
}

/** True when the successor has taken over the payment due `due` in grid row `row`:
 *  drawn in an earlier row, or in that row and started before the payment falls due
 *  (ADR 0027). */
function replacedAt(
  link: ChainLink,
  row: number,
  due: Date,
  baseDate: Date,
): boolean {
  if (replacedByMonth(link, row - 1, baseDate)) return true;
  // Not drawn by row − 1, so drawn by `row` means drawn in it.
  return replacedByMonth(link, row, baseDate) && afterSuccessor(link.next, due);
}
