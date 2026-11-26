// The levered IRR and the reason it has no value (ADR 0079): "no unique IRR" or "no IRR
// in range" instead of a blank. `lensKpis` picks it for the lens.
import type { Decimal } from "../../lib/money";
import {
  IRR_BRACKET_LOW,
  IRR_BRACKET_MAX,
  type IrrNoRateReason,
} from "../../engine";
import type { Dictionary } from "../../i18n";
import { fmtPct, fmtSigned } from "../../lib/format";

export interface LeveredIrr {
  rate: Decimal | null;
  reason: IrrNoRateReason | null;
}

/** Why the IRR has no value, or undefined when it has one. */
export function irrReasonText(
  t: Pick<Dictionary, "common">,
  reason: IrrNoRateReason | null,
): string | undefined {
  if (reason === "NOT_UNIQUE") return t.common.irrNotUnique;
  if (reason === "NO_ROOT")
    return t.common.irrNoRoot(
      fmtPct(IRR_BRACKET_LOW, 0),
      fmtSigned(IRR_BRACKET_MAX, (d) => fmtPct(d, 0)),
    );
  return undefined;
}
