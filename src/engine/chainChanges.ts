// What a change to one property's mortgage blocks does to its loan chain (ADR 0160):
// the stored prepayments and maturity changes it stops, and the blocks the schedule
// does not use. Read from `propertySchedule` before and after, so it agrees with the
// REPLACED outcomes the property page warns about (ADR 0109 §9).
import { blockChain, propertySchedule } from "./schedule";
import type {
  Assumptions,
  IsoDate,
  LoanEventOutcome,
  MortgageBlock,
} from "./types";

/** A stored event that applied before the change and no longer does after it. */
export interface StoppedLoanEvent {
  /** The block that now takes over from the event's block. */
  by: string;
  blockId: string;
  kind: "prepayment" | "recast";
  date: IsoDate;
}

export interface LoanChainChanges {
  /** In date order. */
  stopped: StoppedLoanEvent[];
  /** Ids of `after` blocks outside the chain: they start before the block in force. */
  unused: string[];
}

const replaced = (o: LoanEventOutcome) =>
  o.issue === "PREPAYMENT_REPLACED" || o.issue === "RECAST_REPLACED";

const key = (o: LoanEventOutcome) =>
  `${o.blockId}|${o.kind}|${o.date.getTime()}`;

/**
 * Compare one property's blocks `before` and `after` a change. An event stops when it
 * applied before and is REPLACED after, or when its block left the chain (a new block
 * in force at baseDate) and it is dated after the new block's start; an event dated
 * before that start lies in the replaced past.
 */
export function loanChainChanges(
  before: MortgageBlock[],
  after: MortgageBlock[],
  assumptions: Assumptions,
): LoanChainChanges {
  const chain = blockChain(after, assumptions.baseDate);
  const unused = after
    .filter((b) => !chain.some((c) => c.id === b.id))
    .map((b) => b.id);

  const now = new Map<string, LoanEventOutcome[]>();
  for (const o of propertySchedule(after, assumptions).eventOutcomes)
    now.set(key(o), [...(now.get(key(o)) ?? []), o]);

  const stopped: StoppedLoanEvent[] = [];
  for (const o of propertySchedule(before, assumptions).eventOutcomes) {
    if (replaced(o)) continue;
    const later = now.get(key(o))?.shift();
    const i = chain.findIndex((b) => b.id === o.blockId);
    // Still in the chain: its next block; left the chain: the new block in force.
    const by = i >= 0 ? chain[i + 1] : chain[0];
    if (!by) continue;
    const stops = later
      ? replaced(later)
      : o.date.getTime() > by.startDate.getTime();
    if (stops)
      stopped.push({
        by: by.id,
        blockId: o.blockId,
        kind: o.kind,
        date: o.date,
      });
  }
  stopped.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { stopped, unused };
}
