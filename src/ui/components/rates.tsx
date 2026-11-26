// Rates that may have no value: a percentage, or a levered IRR with the reason it has
// none, which read "n/a" in the active language.
import type { Decimal } from "../../lib/money";
import { fmtPct } from "../../lib/format";
import { irrReasonText, type LeveredIrr } from "../model/irr";
import { useT } from "../hooks/useT";

type Num = Decimal | number;

/** A percentage; null (a ratio with no base, e.g. LTV on no value) reads "n/a"
 *  (ADR 0133). */
export function Pct({ value, dp = 1 }: { value: Num | null; dp?: number }) {
  const t = useT();
  return (
    <span className="num">
      {value === null ? t.common.notApplicable : fmtPct(value, dp)}
    </span>
  );
}

/** A levered IRR, or "n/a" with the reason it has none as a tooltip and for screen
 *  readers. */
export function IrrValue({ irr, dp = 1 }: { irr: LeveredIrr; dp?: number }) {
  const t = useT();
  if (irr.rate) return <Pct value={irr.rate} dp={dp} />;
  const note = irrReasonText(t, irr.reason);
  return (
    <span className="num" title={note}>
      {t.common.notApplicable}
      {note && <span className="sr-only"> ({note})</span>}
    </span>
  );
}
