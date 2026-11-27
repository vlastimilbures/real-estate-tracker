// A property's refinance chain (ADR 0027): the block that drives its schedule, the later
// blocks that replace it in turn, and when a successor has replaced a block.
import { firstAfter, inForceOrUpcoming, isOnOrBefore } from "../dates";
import { drawMonth } from "../loanTerm";
import type { MortgageBlock } from "../types";

/**
 * The block that drives a property's schedule (and its initial principal): the block
 * active at `baseDate`, or — if none yet (a future loan) — the earliest upcoming block,
 * so the property still gets a future-drawn schedule. `blocks` must already be the
 * single property's blocks.
 */
export function selectBlock(
  blocks: MortgageBlock[],
  baseDate: Date,
): MortgageBlock | undefined {
  // No end accessor: a block stays active until a later one starts. With none active,
  // every block starts after baseDate, so "nearest upcoming" is the earliest block.
  return inForceOrUpcoming(blocks, baseDate, (b) => b.startDate);
}

/**
 * The blocks that drive a property's schedule: the block in force at baseDate (else
 * the earliest upcoming one), then each later start in order — a successor replaces
 * its predecessor from its start (ADR 0027). Earlier blocks are already replaced.
 */
export function blockChain(
  blocks: MortgageBlock[],
  baseDate: Date,
): MortgageBlock[] {
  const chain: MortgageBlock[] = [];
  let block = selectBlock(blocks, baseDate);
  while (block) {
    chain.push(block);
    block = firstAfter(blocks, block.startDate, (b) => b.startDate);
  }
  return chain;
}

/** One block of a refinance chain with the successor that replaces it, if any. */
export interface ChainLink {
  block: MortgageBlock;
  next: MortgageBlock | undefined;
}

/** The chain of `blockChain` at `date`, each block with its successor: the one place the
 *  chain's block/successor pairs are built. */
export function chainLinks(blocks: MortgageBlock[], date: Date): ChainLink[] {
  const chain = blockChain(blocks, date);
  return chain.map((block, i) => ({ block, next: chain[i + 1] }));
}

/**
 * True when an item dated `date` falls after the successor's start, so the block never
 * draws or applies it: the successor replaces the block from that date (ADR 0027,
 * ADR 0109). False without a successor. An invalid date counts as after the successor;
 * callers rely on `assertLoanRows` (via `propertySchedules`) having refused one upstream.
 */
export function afterSuccessor(
  next: MortgageBlock | undefined,
  date: Date,
): boolean {
  return next !== undefined && !isOnOrBefore(date, next.startDate);
}

/** True when the link's successor has started on or before `date`, so it has replaced
 *  the block by then (ADR 0027). False without a successor. */
export function replacedOnOrBefore(link: ChainLink, date: Date): boolean {
  return link.next !== undefined && isOnOrBefore(link.next.startDate, date);
}

/** True when the link's successor has drawn by grid month `m`: the schedule follows the
 *  successor from its draw month (ADR 0027). False without a successor. */
export function replacedByMonth(
  link: ChainLink,
  m: number,
  baseDate: Date,
): boolean {
  return link.next !== undefined && drawMonth(link.next, baseDate) <= m;
}
