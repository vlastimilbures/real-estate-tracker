// A mortgage block itself (ADR 0074): its one constructor and its plain / development
// kind.
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
