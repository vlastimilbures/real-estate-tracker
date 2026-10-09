// ADR 0099: which open-ended record a newly added valuation or lease succeeds; ADR 0163:
// which leases overlap.
import { isAfter, isOnOrBefore } from "./dates";
import type { Lease } from "./types";

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

/**
 * The pairs of leases of one property that overlap (ADR 0163): both are in force on some
 * day, ends included, so an end on the next start overlaps and back-to-back leases do
 * not. Leases of one apartment never overlap; a pair can only be stored data from before
 * the rule. Ordered by start (stable), each pair earlier start first.
 */
export function overlappingLeases(leases: readonly Lease[]): [Lease, Lease][] {
  const byStart = [...leases].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  );
  const pairs: [Lease, Lease][] = [];
  byStart.forEach((a, i) => {
    for (const b of byStart.slice(i + 1)) {
      if (b.propertyId !== a.propertyId) continue;
      if (a.endDate === undefined || isOnOrBefore(b.startDate, a.endDate))
        pairs.push([a, b]);
    }
  });
  return pairs;
}
