// The levered IRR under the lens and the reason it has no value (UX-079, DR-158,
// ADR 0079): "no unique IRR" or "no IRR in range" instead of a blank.
import type { Decimal } from "../../lib/money";
import type { IrrNoRateReason, PortfolioKPIs } from "../../engine";
import type { Dictionary } from "../../i18n";
import type { Mode } from "./lens";

export interface LeveredIrr {
  rate: Decimal | null;
  reason: IrrNoRateReason | null;
}

/** The levered IRR of the lens, with the reason it is null. */
export function leveredIrr(kpis: PortfolioKPIs, mode: Mode): LeveredIrr {
  return mode === "real"
    ? { rate: kpis.leveredIrrReal, reason: kpis.leveredIrrRealReason }
    : { rate: kpis.leveredIrrNominal, reason: kpis.leveredIrrNominalReason };
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
