// Optional table columns shown only when they hold something (ADR 0116 §12).
import type { Decimal } from "../../lib/money";

/** The columns some row has a non-zero value in, in the order given. */
export function nonZeroColumns<K extends string, R extends Record<K, Decimal>>(
  rows: readonly R[],
  cols: { key: K; header: string }[],
): { key: K; header: string }[] {
  return cols.filter(({ key }) => rows.some((r) => !r[key].isZero()));
}
