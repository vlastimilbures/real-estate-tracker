// ADR 0099: which open-ended record a newly added valuation or lease succeeds.
import { isAfter } from "./dates";

/**
 * The open-ended record (blank end) of `propertyId` with the latest start strictly
 * before `newStart`, or `undefined` when there is none. Same-start ties keep input
 * order (the last one wins), as in `lastOnOrBefore`.
 */
export function openPredecessor<T extends { propertyId: string }>(
  rows: readonly T[],
  propertyId: string,
  newStart: Date,
  getStart: (x: T) => Date,
  getEnd: (x: T) => Date | undefined,
): T | undefined {
  let best: T | undefined;
  for (const r of rows) {
    if (r.propertyId !== propertyId || getEnd(r) !== undefined) continue;
    if (!isAfter(newStart, getStart(r))) continue;
    if (!best || !isAfter(getStart(best), getStart(r))) best = r;
  }
  return best;
}
