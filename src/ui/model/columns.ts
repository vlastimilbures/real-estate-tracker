// Optional table columns shown only when they hold something (ADR 0116 §12).
import type { Decimal } from "../../lib/money";
import { roundCzk } from "../../lib/format";

/** The columns some row shows a non-zero amount in, rounded to whole Kč as the screen and
 *  the export print it, in the order given (ADR 0178, amends ADR 0130 §5). */
export function nonZeroColumns<K extends string, R extends Record<K, Decimal>>(
  rows: readonly R[],
  cols: { key: K; header: string }[],
): { key: K; header: string }[] {
  return cols.filter(({ key }) => rows.some((r) => !roundCzk(r[key]).isZero()));
}
