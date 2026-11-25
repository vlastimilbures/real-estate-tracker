// Blocks of one property on one start date, or within a month of each other (D-27,
// D-43, ADR 0226 §2).
import { edate, isAfter, isOnOrBefore } from "../dates";
import { EngineInputError } from "../errors";
import type { MortgageBlock } from "../types";
import type { ValidationCode } from "./codes";
import { badDate, rowError } from "./check";

/**
 * Blocks that start on the same date as an earlier-listed block of the same property.
 * Only these overlap; a later start is a successor (D-27, D-43).
 */
export function duplicateStarts(blocks: MortgageBlock[]): Set<MortgageBlock> {
  const starts = new Set<string>();
  const dupes = new Set<MortgageBlock>();
  for (const b of blocks) {
    const key = `${b.propertyId}|${b.startDate.getTime()}`;
    if (starts.has(key)) dupes.add(b);
    starts.add(key);
  }
  return dupes;
}

/** Each property's blocks with a valid start date, in input order. */
function blocksByProperty(blocks: MortgageBlock[]): MortgageBlock[][] {
  const byProperty = new Map<string, MortgageBlock[]>();
  for (const b of blocks) {
    if (badDate(b.startDate)) continue; // INVALID_DATE reports it
    byProperty.set(b.propertyId, [...(byProperty.get(b.propertyId) ?? []), b]);
  }
  return [...byProperty.values()];
}

/**
 * Blocks that start on or before EDATE(the property's next-earlier start, 1), and the
 * blocks on that earlier start: two refinancings within one month are not modelled
 * (ADR 0226 §2). Blocks on one start are DUPLICATE_BLOCK_START only. Checking every
 * earlier start names the same blocks: a start between the two is within the month too.
 */
export function refinancesWithinAMonth(
  blocks: MortgageBlock[],
): Set<MortgageBlock> {
  const flagged = new Set<MortgageBlock>();
  for (const own of blocksByProperty(blocks)) {
    for (const a of own) {
      const month = edate(a.startDate, 1);
      for (const b of own) {
        if (
          isAfter(b.startDate, a.startDate) &&
          isOnOrBefore(b.startDate, month)
        )
          flagged.add(a).add(b);
      }
    }
  }
  return flagged;
}

/** A start-date problem on a block. */
const startError = (code: ValidationCode, b: MortgageBlock) =>
  rowError({ entity: "mortgage", id: b.id }, code, "startDate");

/** Raise DUPLICATE_BLOCK_START for overlapping blocks of one property (D-27, D-43),
 *  then REFINANCE_WITHIN_A_MONTH for blocks starting within a month of the one they
 *  replace (ADR 0226 §2). */
export function assertBlockStarts(blocks: MortgageBlock[]): void {
  const quick = refinancesWithinAMonth(blocks);
  const errors = [
    ...[...duplicateStarts(blocks)].map((b) =>
      startError("DUPLICATE_BLOCK_START", b),
    ),
    ...blocks
      .filter((b) => quick.has(b))
      .map((b) => startError("REFINANCE_WITHIN_A_MONTH", b)),
  ];
  if (errors.length > 0) throw new EngineInputError(errors);
}
