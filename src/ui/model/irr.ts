// The levered IRR and the reason it has no value (UX-079, DR-158, ADR 0079): "no unique
// IRR" or "no IRR in range" instead of a blank. `lensKpis` picks it for the lens.
import type { Decimal } from "../../lib/money";
import type { IrrNoRateReason } from "../../engine";
import type { Dictionary } from "../../i18n";

export interface LeveredIrr {
  rate: Decimal | null;
  reason: IrrNoRateReason | null;
}

/** Why the IRR has no value, or undefined when it has one. */
export function irrReasonText(
  t: Dictionary,
  reason: IrrNoRateReason | null,
): string | undefined {
  if (reason === "NOT_UNIQUE") return t.common.irrNotUnique;
  if (reason === "NO_ROOT") return t.common.irrNoRoot;
  return undefined;
}
