// Optional table columns shown only when they hold something (ADR 0116 §12).
import type { Decimal } from "../../lib/money";

/** Half a haléř: a value below it rounds to 0 Kč on screen (ADR 0130). */
const HALF_HALER = 0.005;

/** The columns some row has a value of at least half a haléř in, in the order given. */
export function nonZeroColumns<K extends string, R extends Record<K, Decimal>>(
  rows: readonly R[],
  cols: { key: K; header: string }[],
): { key: K; header: string }[] {
  return cols.filter(({ key }) =>
    rows.some((r) => r[key].abs().greaterThanOrEqualTo(HALF_HALER)),
  );
}
