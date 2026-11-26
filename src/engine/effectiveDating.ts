// Effective-dated records (valuations, leases): which open-ended record a newly added
// one succeeds and ends (ADR 0099) and which leases overlap (ADR 0163).
import { byStart, dayBefore, isAfter, isOnOrBefore } from "./dates";
import type { Lease, Valuation } from "./types";

/**
 * The open-ended record (blank end) of `propertyId` with the latest start strictly
 * before `newStart`, or `undefined` when there is none. Same-start ties keep input
 * order (the last one wins), as in `lastOnOrBefore`.
 */
// eslint-disable-next-line max-params -- public API with app and test callers
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
 * The valuation an added one `v` ends (ADR 0227): the open-ended one before it, now
 * ending the day before `v` starts. Undefined for a dated `v`, which changes no other
 * row (ADR 0144), and when there is none to end.
 */
export function valuationClosedBy(
  rows: readonly Valuation[],
  v: Valuation,
): Valuation | undefined {
  const prev = v.validTo
    ? undefined
    : openPredecessor(
        rows,
        v.propertyId,
        v.validFrom,
        (r) => r.validFrom,
        (r) => r.validTo,
      );
  return prev ? { ...prev, validTo: dayBefore(v.validFrom) } : undefined;
}

/**
 * The lease an added one `l` ends (ADR 0163: leases never overlap): the open-ended one
 * before it, dated `l` or not, now ending the day before `l` starts. Undefined when
 * there is none to end.
 */
export function leaseClosedBy(
  rows: readonly Lease[],
  l: Lease,
): Lease | undefined {
  const prev = openPredecessor(
    rows,
    l.propertyId,
    l.startDate,
    (r) => r.startDate,
    (r) => r.endDate,
  );
  return prev ? { ...prev, endDate: dayBefore(l.startDate) } : undefined;
}

/**
 * The pairs of leases of one property that overlap (ADR 0163): both are in force on some
 * day, ends included, so an end on the next start overlaps and back-to-back leases do
 * not. Leases of one apartment never overlap; a pair can only be stored data from before
 * the rule. Ordered by start (stable), each pair earlier start first.
 */
export function overlappingLeases(leases: readonly Lease[]): [Lease, Lease][] {
  const sorted = [...leases].sort(byStart((l) => l.startDate));
  const pairs: [Lease, Lease][] = [];
  sorted.forEach((a, i) => {
    for (const b of sorted.slice(i + 1)) {
      if (b.propertyId !== a.propertyId) continue;
      if (a.endDate === undefined || isOnOrBefore(b.startDate, a.endDate))
        pairs.push([a, b]);
    }
  });
  return pairs;
}
