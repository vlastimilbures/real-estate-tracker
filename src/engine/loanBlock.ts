// A mortgage block itself (ADR 0074): its one constructor, its plain / development kind
// and the blocks derived from it.
import { isOnOrBefore } from "./dates";
import type {
  DevelopmentLoan,
  MortgageBlock,
  MortgageBlockFields,
} from "./types";

/**
 * True when the block uses development-loan features — gradual tranche draws or an
 * interest-only-until-completion period. Plain single-draw loans return false and
 * take `buildSchedule`'s legacy path verbatim (the parity gate).
 */
export function isDevLoan(block: MortgageBlock): block is DevelopmentLoan {
  return (block.draws?.length ?? 0) > 0 || block.completionDate != null;
}

/**
 * Type stored or entered loan fields as a `MortgageBlock`, returning the same object.
 * Not value-checked: a development loan without a term can exist in the DB, and
 * `validateInputs` / `termMonths` reject it (DR-051, D-17). The one sanctioned
 * `as MortgageBlock` (ADR 0074).
 */
export function mortgageBlock(fields: MortgageBlockFields): MortgageBlock {
  // eslint-disable-next-line no-restricted-syntax -- the sanctioned MortgageBlock constructor
  return fields as MortgageBlock;
}

/**
 * The block as it runs until a successor starting on `date` replaces it: its tranches,
 * prepayments and recasts dated after `date` dropped (D-47, DR-126, ADR 0109); the same
 * block when none is. Built through `mortgageBlock`; the term stays, so cutting tranches
 * never leaves a development loan without one. A development loan left with no tranche
 * and no completion date counts as a plain loan (`isDevLoan`).
 */
export function cutAfter(block: MortgageBlock, date: Date): MortgageBlock {
  const keep = (e: { date: Date }) => isOnOrBefore(e.date, date);
  const draws = block.draws?.filter(keep);
  const prepayments = block.prepayments?.filter(keep);
  const recasts = block.recasts?.filter(keep);
  const unchanged =
    sameLength(prepayments, block.prepayments) &&
    sameLength(recasts, block.recasts) &&
    sameLength(draws, block.draws);
  if (unchanged) return block;
  return mortgageBlock({ ...block, draws, prepayments, recasts });
}

/** True when both lists are absent or have the same length. */
const sameLength = (
  a: readonly unknown[] | undefined,
  b: readonly unknown[] | undefined,
): boolean => a?.length === b?.length;

/** The block without its prepayments; its recasts and tranches stay (ADR 0116). The same
 *  block when it has none. Built through `mortgageBlock`. */
export function withoutPrepayments(block: MortgageBlock): MortgageBlock {
  return block.prepayments?.length
    ? mortgageBlock({ ...block, prepayments: undefined })
    : block;
}
